import { decomposePdf } from './dist/api/decomposePdf.js';

(async () => {
  console.log('🧪 Testing elementComposer feature...\n');
  
  const result = await decomposePdf('./scripts/test-input/demo.pdf', {
    elementComposer: true,
    assetPath: './test-element-composer'
  });
  
  // Ambil page 2 untuk cek paragraph yang disebutkan user
  const page2 = result.find(p => p.pageNumber === 2);
  if (page2) {
    console.log('=== PAGE 2 ELEMENTS (with elementComposer) ===');
    console.log('Total elements:', page2.elements.length);
    
    // Lihat element yang composed
    const composedElements = page2.elements.filter(e => e.attributes?.composed);
    const textElements = page2.elements.filter(e => e.type === 'text');
    const paragraphElements = page2.elements.filter(e => e.type === 'paragraph');
    
    console.log('Composed elements:', composedElements.length);
    console.log('Text elements (not composed):', textElements.length);
    console.log('Paragraph elements:', paragraphElements.length);
    
    // Tampilkan beberapa composed elements
    console.log('\n=== COMPOSED PARAGRAPHS ===');
    composedElements.slice(0, 8).forEach((el, i) => {
      console.log(`\n[${i+1}] Type: ${el.type}`);
      console.log('Length:', el.data.length, 'chars');
      console.log('Data:', el.data.substring(0, 150) + (el.data.length > 150 ? '...' : ''));
      console.log('FontSize:', el.attributes?.fontSize);
      console.log('BoundingBox top:', el.boundingBox?.top);
    });
    
    // Cari paragraph yang kemungkinan mengandung text "In the midst of Saudi Arabia's sweeping wave"
    console.log('\n=== SEARCHING FOR TARGET PARAGRAPH ===');
    const targetParagraph = composedElements.find(el => 
      el.data.includes('In the midst of Saudi Arabia\'s sweeping wave') ||
      el.data.includes('Saudi Arabia') && el.data.includes('modernization')
    );
    
    if (targetParagraph) {
      console.log('✅ Found target paragraph!');
      console.log('Length:', targetParagraph.data.length, 'chars');
      console.log('Full text:', targetParagraph.data);
      console.log('FontSize:', targetParagraph.attributes?.fontSize);
    } else {
      console.log('❌ Target paragraph not found as single composed element');
      // Check if it exists as separate elements
      const separateElements = page2.elements.filter(el => 
        el.data.includes('Saudi Arabia') || 
        el.data.includes('modernization') ||
        el.data.includes('midst of')
      );
      console.log('Found', separateElements.length, 'separate elements with related text:');
      separateElements.forEach((el, i) => {
        console.log(`  [${i+1}] "${el.data.substring(0, 50)}..."`);
      });
    }
  }
})().catch(console.error);
