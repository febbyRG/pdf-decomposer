import { decomposePdf } from './dist/index.js';

(async () => {
  console.log('🔍 EXAMINING ELEMENT [11] CONTENT...\n');
  
  const result = await decomposePdf('./scripts/test-input/demo.pdf', {
    elementComposer: true,
    assetPath: './test-element-11'
  });
  
  const page2 = result.find(p => p.pageNumber === 2);
  if (!page2) return;
  
  const element11 = page2.elements[10]; // 0-indexed element [11]
  console.log(`Element [11] - Length: ${element11.data.length} chars`);
  console.log('Full content:');
  console.log('---');
  console.log(element11.data);
  console.log('---');
  
  // Let's also look at the raw elements to see what should be separated
  const rawResult = await decomposePdf('./scripts/test-input/demo.pdf', {
    elementComposer: false,
    assetPath: './test-raw-check'
  });
  
  const rawPage2 = rawResult.find(p => p.pageNumber === 2);
  console.log('\n=== KEY RAW ELEMENTS (Part 1, 2, 3 boundaries) ===');
  
  rawPage2.elements
    .filter(el => el.type === 'text')
    .forEach((el, i) => {
      const text = el.data.trim();
      if (text.includes('of The Point\'s Journey.') ||
          text.includes('Can you share a brief') ||
          text.includes('My path into the shopping') ||
          text.includes('MOHAMMAD ALAWI') ||
          text.includes('With over 30 years')) {
        const preview = text.substring(0, 50);
        console.log(`[${i}] "${preview}..." (${text.length} chars)`);
        console.log(`    Position: Y:${Math.round(el.boundingBox?.top || el.y || 0)} X:${Math.round(el.boundingBox?.left || el.x || 0)}`);
        console.log(`    Full: "${text}"`);
        console.log('');
      }
    });
  
})();
