import { decomposePdf } from './dist/api/decomposePdf.js';

(async () => {
  console.log('🔍 Debug target paragraph search...\n');
  
  const result = await decomposePdf('./scripts/test-input/demo.pdf', {
    elementComposer: true,
    assetPath: './test-debug-search'
  });
  
  const page2 = result.find(p => p.pageNumber === 2);
  if (page2) {
    console.log('=== SEARCHING FOR TARGET PARAGRAPHS ===');
    
    // Search with different patterns
    const patterns = [
      'In the midst of Saudi Arabia',
      'midst of Saudi',
      'Saudi Arabia',
      'modernization',
      'development endeavor',
      'endeavor is underway'
    ];
    
    patterns.forEach(pattern => {
      const found = page2.elements.filter(el => el.data.includes(pattern));
      console.log(`Pattern "${pattern}": ${found.length} matches`);
      if (found.length > 0) {
        found.forEach((el, i) => {
          console.log(`  [${i+1}] "${el.data.substring(0, 100)}..." (${el.data.length} chars)`);
        });
      }
    });
    
    console.log('\n=== ALL ELEMENTS WITH "Saudi" ===');
    const saudiElements = page2.elements.filter(el => el.data.toLowerCase().includes('saudi'));
    saudiElements.forEach((el, i) => {
      console.log(`[${i+1}] ${el.data.length} chars: "${el.data.substring(0, 120)}..."`);
    });
  }
})().catch(console.error);
