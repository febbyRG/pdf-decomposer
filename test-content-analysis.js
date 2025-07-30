import { decomposePdf } from './dist/index.js';

(async () => {
  console.log('🔍 DETAILED ELEMENT CONTENT ANALYSIS...\n');
  
  const result = await decomposePdf('./scripts/test-input/demo.pdf', {
    elementComposer: true,
    assetPath: './test-content-analysis'
  });
  
  const page2 = result.find(p => p.pageNumber === 2);
  if (!page2) return;
  
  console.log('=== ELEMENT [6] - MIXED CONTENT ===');
  const element6 = page2.elements[5]; // 0-indexed
  console.log(`Length: ${element6.data.length} chars`);
  console.log('Full content:');
  console.log(`"${element6.data}"`);
  
  console.log('\n=== ELEMENT [7] - MIXED CONTENT ===');
  const element7 = page2.elements[6]; // 0-indexed
  console.log(`Length: ${element7.data.length} chars`);
  console.log('Full content:');
  console.log(`"${element7.data}"`);
  
  console.log('\n=== ELEMENT [8] - MIXED CONTENT ===');
  const element8 = page2.elements[7]; // 0-indexed
  console.log(`Length: ${element8.data.length} chars`);
  console.log('Full content:');
  console.log(`"${element8.data}"`);
  
  console.log('\n=== ELEMENT [9] - MIXED CONTENT ===');
  const element9 = page2.elements[8]; // 0-indexed
  console.log(`Length: ${element9.data.length} chars`);
  console.log('Full content:');
  console.log(`"${element9.data}"`);
  
})();
