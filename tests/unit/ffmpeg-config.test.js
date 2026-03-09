const FFmpegConfig = require('../../src/config/ffmpeg');

describe('FFmpeg Configuration', () => {
  test('should have default values', () => {
    expect(FFmpegConfig.defaultTimeout).toBe(2); // 2 heures
    expect(FFmpegConfig.maxUploadSize).toBe(5000); // 5GB
    expect(FFmpegConfig.maxConcurrentJobs).toBe(4);
    expect(FFmpegConfig.tempFileTTL).toBe(24); // 24 heures
  });
  
  test('should have correct paths', () => {
    expect(FFmpegConfig.uploadDir).toBe('./uploads');
    expect(FFmpegConfig.outputDir).toBe('./output');
  });
  
  test('should calculate timeout in milliseconds', () => {
    const expectedMs = 2 * 60 * 60 * 1000; // 2 heures en ms
    expect(FFmpegConfig.defaultOptions.timeout).toBe(expectedMs);
    expect(FFmpegConfig.defaultOptions.killSignal).toBe('SIGTERM');
  });
  
  test('should have reasonable values', () => {
    // Timeout > 0
    expect(FFmpegConfig.defaultTimeout).toBeGreaterThan(0);
    
    // Upload size > 0
    expect(FFmpegConfig.maxUploadSize).toBeGreaterThan(0);
    
    // Concurrent jobs > 0
    expect(FFmpegConfig.maxConcurrentJobs).toBeGreaterThan(0);
    
    // TTL > 0
    expect(FFmpegConfig.tempFileTTL).toBeGreaterThan(0);
  });
});
