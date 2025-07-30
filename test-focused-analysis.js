import { decomposePdf } from './dist/api/decomposePdf.js';

(async () => {
  console.log('🔍 Focused paragraph analysis...\n');
  
  const result = await decomposePdf('./scripts/test-input/demo.pdf', {
    elementComposer: true,
    assetPath: './test-focused'
  });
  
  const page2 = result.find(p => p.pageNumber === 2);
  if (page2) {
    console.log('=== ALL ELEMENTS ON PAGE 2 ===');
    
    page2.elements.forEach((el, i) => {
      const text = (el.data || '').trim();
      if (text.length > 2) { // Skip whitespace-only elements
        console.log(`[${i+1}] FontSize: ${el.attributes?.fontSize}, Top: ${el.boundingBox?.top?.toFixed(1)}`);
        console.log(`    Text: "${text.substring(0, 80)}${text.length > 80 ? '...' : ''}"`);
        console.log(`    Type: ${el.type}, Composed: ${el.attributes?.composed}`);
        
        // Check for target paragraph parts
        if (text.includes('midst') || text.includes('development') || text.includes('endeavor') || 
            text.includes('underway') || text.includes('offerings') || text.includes('interview')) {
          console.log(`    *** TARGET PARAGRAPH PART ***`);
        }
        console.log('');
      }
    });
  }
})().catch(console.error);
