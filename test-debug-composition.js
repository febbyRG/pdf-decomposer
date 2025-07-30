import { decomposePdf } from './dist/api/decomposePdf.js';

(async () => {
  console.log('🧪 Debugging element composition process...\n');
  
  // Test WITHOUT elementComposer first
  console.log('=== WITHOUT ELEMENT COMPOSER ===');
  const resultWithout = await decomposePdf('./scripts/test-input/demo.pdf', {
    elementComposer: false,
    assetPath: './test-debug-without'
  });
  
  const page2Without = resultWithout.find(p => p.pageNumber === 2);
  if (page2Without) {
    const relevantElements = page2Without.elements
      .filter(el => {
        const text = el.data.toLowerCase();
        return text.includes('shopping') || text.includes('saudi') || text.includes('modernization') || text.includes('development');
      })
      .sort((a, b) => (a.boundingBox?.top || 0) - (b.boundingBox?.top || 0));
    
    console.log('Relevant raw elements:');
    relevantElements.slice(0, 10).forEach((el, i) => {
      console.log(`[${i+1}] "${el.data}" (FontSize: ${el.attributes?.fontSize}, Top: ${el.boundingBox?.top})`);
    });
  }
  
  // Test WITH elementComposer
  console.log('\n=== WITH ELEMENT COMPOSER ===');
  const resultWith = await decomposePdf('./scripts/test-input/demo.pdf', {
    elementComposer: true,
    assetPath: './test-debug-with'
  });
  
  const page2With = resultWith.find(p => p.pageNumber === 2);
  if (page2With) {
    const relevantElements = page2With.elements
      .filter(el => {
        const text = el.data.toLowerCase();
        return text.includes('shopping') || text.includes('saudi') || text.includes('modernization') || text.includes('development');
      })
      .sort((a, b) => (a.boundingBox?.top || 0) - (b.boundingBox?.top || 0));
    
    console.log('Relevant composed elements:');
    relevantElements.forEach((el, i) => {
      console.log(`[${i+1}] "${el.data}" (FontSize: ${el.attributes?.fontSize}, Top: ${el.boundingBox?.top})`);
      console.log(`    Type: ${el.type}, Composed: ${el.attributes?.composed}`);
    });
  }
})().catch(console.error);
