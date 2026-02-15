const { exec } = require('child_process');
const os = require('os');
const fs = require('fs-extra');
const path = require('path');
const { getSnapshotDir, getTimestamp } = require('../utils/helpers');
const logger = require('../utils/logger');

class ProcessSnapshot {
  constructor() {
    this.snapshotDir = getSnapshotDir();
    this.processPatterns = ['node', 'npm', 'yarn', 'pnpm', 'python', 'java', 'go', 'cargo', 'rustc', 'mongod', 'postgres', 'mysql', 'redis'];
    this.excludePatterns = ['grep', 'sed', 'awk', 'xargs', 'ps'];
  }

  async init() {
    await fs.ensureDir(this.snapshotDir);
  }

  async captureProcesses() {
    const processes = [];
    const platform = os.platform();
    let psCommand = platform === 'darwin' ? 'ps -ax -o pid,ppid,user,%cpu,%mem,etime,command' : 'ps -aux';
    
    try {
      const result = await this.runCommand(psCommand);
      if (result) {
        const lines = result.split('\n').slice(1);
        for (const line of lines) {
          const process = this.parseProcessLine(line, platform);
          if (process && this.shouldCapture(process)) {
            processes.push(process);
          }
        }
      }
    } catch (e) {
      logger.warning('Could not capture processes');
    }
    
    return processes;
  }

  parseProcessLine(line, platform) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 7) return null;
    
    if (platform === 'darwin') {
      return {
        pid: parseInt(parts[0]),
        ppid: parseInt(parts[1]),
        user: parts[2],
        cpu: parseFloat(parts[3]),
        memory: parseFloat(parts[4]),
        elapsed: parts[5],
        command: parts.slice(6).join(' '),
        raw: line
      };
    } else {
      return {
        pid: parseInt(parts[1]),
        user: parts[0],
        cpu: parseFloat(parts[2]),
        memory: parseFloat(parts[3]),
        vsz: parseInt(parts[4]),
        rss: parseInt(parts[5]),
        tty: parts[6],
        stat: parts[7],
        start: parts[8],
        time: parts[9],
        command: parts.slice(10).join(' '),
        raw: line
      };
    }
  }

  shouldCapture(process) {
    const command = process.command.toLowerCase();
    if (this.excludePatterns.some(p => command.includes(p))) return false;
    return this.processPatterns.some(pattern => command.includes(pattern.toLowerCase()));
  }

  async getPorts() {
    const ports = [];
    const platform = os.platform();
    let command = platform === 'darwin' ? 'lsof -i -P -n | grep LISTEN' : 'ss -tulpn | grep LISTEN';
    
    try {
      const result = await this.runCommand(command);
      if (result) {
        for (const line of result.split('\n').filter(l => l)) {
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 2) {
            ports.push({
              command: parts[0],
              pid: parseInt(parts[1]),
              name: parts[parts.length - 1]
            });
          }
        }
      }
    } catch (e) {
      logger.warning('Could not get port information');
    }
    return ports;
  }

  async captureState() {
    const processes = await this.captureProcesses();
    const ports = await this.getPorts();
    return {
      processes,
      ports,
      capturedAt: new Date().toISOString()
    };
  }

  async saveSnapshot(name) {
    await this.init();
    const timestamp = getTimestamp();
    const snapshotName = name ? `${timestamp}_${name}` : timestamp;
    const snapshotPath = path.join(this.snapshotDir, snapshotName);
    await fs.ensureDir(snapshotPath);
    
    logger.progress('Capturing process state...');
    const state = await this.captureState();
    await fs.writeJson(path.join(snapshotPath, 'state.json'), state, { spaces: 2 });
    
    logger.success(`Captured ${state.processes.length} processes, ${state.ports.length} ports`);
    return { name: snapshotName, path: snapshotPath, state };
  }

  async loadSnapshot(name) {
    const snapshotPath = path.join(this.snapshotDir, name);
    if (!await fs.pathExists(snapshotPath)) {
      throw new Error(`Snapshot "${name}" not found`);
    }
    return await fs.readJson(path.join(snapshotPath, 'state.json'));
  }

  async listSnapshots() {
    await this.init();
    const entries = await fs.readdir(this.snapshotDir, { withFileTypes: true });
    const snapshots = [];
    
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const statePath = path.join(this.snapshotDir, entry.name, 'state.json');
        if (await fs.pathExists(statePath)) {
          const state = await fs.readJson(statePath);
          const stats = await fs.stat(path.join(this.snapshotDir, entry.name));
          snapshots.push({
            name: entry.name,
            createdAt: state.capturedAt,
            processes: state.processes.length,
            ports: state.ports.length,
            size: stats.size
          });
        }
      }
    }
    snapshots.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return snapshots;
  }

  async restoreSnapshot(name) {
    const state = await this.loadSnapshot(name);
    logger.info(`Snapshot contained ${state.processes.length} processes`);
    logger.info('Note: Process restoration is informational only');
  }

  async deleteSnapshot(name) {
    const snapshotPath = path.join(this.snapshotDir, name);
    if (!await fs.pathExists(snapshotPath)) {
      throw new Error(`Snapshot "${name}" not found`);
    }
    await fs.remove(snapshotPath);
    logger.success(`Deleted snapshot: ${name}`);
  }

  runCommand(command, timeout = 10000) {
    return new Promise((resolve, reject) => {
      exec(command, { timeout }, (error, stdout, stderr) => {
        if (error) reject(error);
        else resolve(stdout.trim());
      });
    });
  }
}

module.exports = ProcessSnapshot;
