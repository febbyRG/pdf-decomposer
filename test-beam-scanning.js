import { decomposePdf } from './dist/api/decomposePdf.js';

(async () => {
  console.log('🔍 Beam Scanning Column Detection Test\n');
  
  const result = await decomposePdf('./scripts/test-input/demo.pdf', {
    elementComposer: true,
    assetPath: './test-beam-scanning'
  });
  
  const page3 = result.find(p => p.pageNumber === 3);
  if (page3) {
    console.log(`📄 Page 3 - Column Layout Analysis:`);
    
    const textElements = page3.elements.filter(el => el.type === 'paragraph' || el.type === 'text');
    
    console.log(`\n📊 Element Positions (Reading Order):`);
    textElements.forEach((el, idx) => {
      const left = el.boundingBox?.left?.toFixed(1);
      const top = el.boundingBox?.top?.toFixed(1);
      const text = (el.data || '').substring(0, 50);
      console.log(`${idx + 1}. [L:${left} T:${top}] "${text}..."`);
    });
    
    // Analyze column detection
    console.log(`\n🔍 Column Analysis:`);
    const leftElements = textElements.filter(el => (el.boundingBox?.left || 0) < 200);
    const rightElements = textElements.filter(el => (el.boundingBox?.left || 0) >= 200);
    
    console.log(`   Left Column (~left < 200): ${leftElements.length} elements`);
    leftElements.forEach((el, idx) => {
      const text = (el.data || '').substring(0, 40);
      console.log(`      ${idx + 1}. "${text}..."`);
    });
    
    console.log(`   Right Column (~left >= 200): ${rightElements.length} elements`);
    rightElements.forEach((el, idx) => {
      const text = (el.data || '').substring(0, 40);
      console.log(`      ${idx + 1}. "${text}..."`);
    });
    
    // Check if reading order is column-based
    console.log(`\n✅ Reading Order Analysis:`);
    let isColumnBased = true;
    let lastColumnLeft = -1;
    
    for (let i = 0; i < textElements.length; i++) {
      const el = textElements[i];
      const currentLeft = el.boundingBox?.left || 0;
      const currentColumn = currentLeft < 200 ? 0 : 1;
      
      if (currentColumn < lastColumnLeft) {
        isColumnBased = false;
        console.log(`   ❌ Jump back detected at element ${i + 1}`);
        break;
      }
      lastColumnLeft = currentColumn;
    }
    
    if (isColumnBased) {
      console.log(`   ✅ Column-based reading order working correctly!`);
    } else {
      console.log(`   ❌ Reading order NOT column-based - elements jumping between columns`);
    }
  }
  
})().catch(console.error);
