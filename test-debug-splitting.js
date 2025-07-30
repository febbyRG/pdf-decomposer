import { decomposePdf } from './dist/index.js';

(async () => {
  console.log('🐛 DEBUG PARAGRAPH SPLITTING LOGIC...\n');
  
  // Create debug version by temporarily modifying the core logic
  const fs = await import('fs');
  
  // Read the current PdfElementComposer
  const composerPath = './src/core/PdfElementComposer.ts';
  const originalCode = fs.readFileSync(composerPath, 'utf8');
  
  // Add debug logging
  const debugCode = originalCode.replace(
    'const shouldStartNewParagraph = !previous ||',
    `// DEBUG: Check why paragraph breaks
      const debugCurrent = (current.formattedData || current.data || '').substring(0, 30);
      const debugPrevious = previous ? (previous.formattedData || previous.data || '').substring(0, 30) : 'NONE';
      
      const strongSemanticBoundary = this.isStrongSemanticBoundary(current, previous);
      const likelyTitle = this.isLikelyTitle(current);
      const largeVerticalGap = this.hasLargeVerticalGap(current, previous) && !this.hasStrongSemanticContinuity(current, previous);
      const majorFontSizeChange = this.hasMajorFontSizeChange(current, previous);
      const columnChange = this.hasColumnChange(current, previous);
      
      if (previous && (debugCurrent.includes('underway in the enchanting') || debugCurrent.includes('by the visionary') || debugCurrent.includes('Project emerges') || debugCurrent.includes('offerings. Embark') || debugCurrent.includes('Mr. Mohammad Alawi as he led'))) {
        console.log(\`\\n🔍 DEBUG Part 1: "\${debugCurrent}..."\`);
        console.log(\`  Previous: "\${debugPrevious}..."\`);
        console.log(\`  strongSemanticBoundary: \${strongSemanticBoundary}\`);
        console.log(\`  likelyTitle: \${likelyTitle}\`);
        console.log(\`  largeVerticalGap: \${largeVerticalGap}\`);
        console.log(\`  majorFontSizeChange: \${majorFontSizeChange}\`);
        console.log(\`  columnChange: \${columnChange}\`);
      }
      
      const shouldStartNewParagraph = !previous ||`
  );
  
  // Write debug version
  fs.writeFileSync(composerPath, debugCode);
  
  // Build and test
  console.log('Building debug version...');
  const { execSync } = await import('child_process');
  execSync('npm run build', { cwd: '/Volumes/Data/Febby/GFamily/projects/pdf-decomposer', stdio: 'inherit' });
  
  console.log('\\nTesting with debug logging...');
  const result = await decomposePdf('./scripts/test-input/demo.pdf', {
    elementComposer: true,
    assetPath: './test-debug-splitting'
  });
  
  // Restore original code
  fs.writeFileSync(composerPath, originalCode);
  
  console.log('\\nDebug complete - original code restored');
  
})();
