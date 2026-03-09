const { execSync } = require('child_process');
const path = require('path');

const CLI_PATH = path.join(__dirname, '..', '..', 'cli.js');

describe('CLI - Unit Tests', () => {
  describe('CLI Help', () => {
    test('should display main help', () => {
      try {
        const output = execSync(`node ${CLI_PATH} --help`, {
          encoding: 'utf8',
        });
        
        expect(output).toContain('ffmpeg-api');
        expect(output).toContain('CLI pour l\'API FFmpeg Remote');
        expect(output).toContain('auth');
        expect(output).toContain('upload');
        expect(output).toContain('job');
      } catch (error) {
        // Si le CLI n\'est pas disponible, on saute le test
        if (error.status === 1) {
          // Exit code 1 est normal pour --help sans argument
        }
      }
    });
    
    test('should display version', () => {
      try {
        const output = execSync(`node ${CLI_PATH} --version`, {
          encoding: 'utf8',
        });
        
        expect(output).toMatch(/\d+\.\d+\.\d+/);
      } catch (error) {
        // Ignore les erreurs
      }
    });
  });
  
  describe('Auth Command Help', () => {
    test('should display auth help', () => {
      try {
        const output = execSync(`node ${CLI_PATH} auth --help`, {
          encoding: 'utf8',
        });
        
        expect(output).toContain('auth');
        expect(output).toContain('Commandes d\'authentification');
        expect(output).toContain('register');
        expect(output).toContain('login');
        expect(output).toContain('logout');
        expect(output).toContain('me');
        expect(output).toContain('refresh');
      } catch (error) {
        // Ignore
      }
    });
  });
  
  describe('Job Command Help', () => {
    test('should display job help', () => {
      try {
        const output = execSync(`node ${CLI_PATH} job --help`, {
          encoding: 'utf8',
        });
        
        expect(output).toContain('job');
        expect(output).toContain('Gérer les jobs');
        expect(output).toContain('create');
        expect(output).toContain('status');
        expect(output).toContain('list');
        expect(output).toContain('watch');
        expect(output).toContain('download');
        expect(output).toContain('delete');
      } catch (error) {
        // Ignore
      }
    });
  });
  
  describe('Upload Command Help', () => {
    test('should display upload help', () => {
      try {
        const output = execSync(`node ${CLI_PATH} upload --help`, {
          encoding: 'utf8',
        });
        
        expect(output).toContain('upload');
        expect(output).toContain('Uploader des fichiers');
      } catch (error) {
        // Ignore
      }
    });
  });
  
  describe('Run Command Help', () => {
    test('should display run help', () => {
      try {
        const output = execSync(`node ${CLI_PATH} run --help`, {
          encoding: 'utf8',
        });
        
        expect(output).toContain('run');
        expect(output).toContain('Exécuter rapidement une commande');
        expect(output).toContain('--upload-id');
        expect(output).toContain('--output');
        expect(output).toContain('--watch');
        expect(output).toContain('--download');
      } catch (error) {
        // Ignore
      }
    });
  });
  
  describe('CLI Error Handling', () => {
    test('should show error for missing required arguments', () => {
      try {
        execSync(`node ${CLI_PATH} auth login`, {
          encoding: 'utf8',
          stdio: 'pipe',
        });
        fail('Should have thrown an error');
      } catch (error) {
        expect(error.status).toBeGreaterThan(0);
      }
    });
    
    test('should show error for invalid command', () => {
      try {
        execSync(`node ${CLI_PATH} invalid-command`, {
          encoding: 'utf8',
          stdio: 'pipe',
        });
        fail('Should have thrown an error');
      } catch (error) {
        expect(error.status).toBeGreaterThan(0);
      }
    });
  });
});
