import { decomposePdf } from './dist/api/decomposePdf.js';

(async () => {
  console.log('🔍 Header Type Test\n');
  
  const result = await decomposePdf('./scripts/test-input/demo.pdf', {
    elementComposer: true,
    assetPath: './test-header-type'
  });
  
  // Check all pages for header elements
  result.forEach(page => {
    const headerElements = page.elements.filter(el => el.type === 'header');
    const textElements = page.elements.filter(el => el.type === 'text');
    const paragraphElements = page.elements.filter(el => el.type === 'paragraph');
    
    if (headerElements.length > 0 || textElements.some(el => ['h1','h2','h3','h4','h5'].includes(el.attributes?.type))) {
      console.log(`📄 Page ${page.pageNumber}:`);
      console.log(`   Headers: ${headerElements.length}, Text: ${textElements.length}, Paragraphs: ${paragraphElements.length}`);
      
      // Show header elements
      headerElements.forEach((el, idx) => {
        console.log(`   Header ${idx+1}: [${el.attributes?.fontSize}pt] "${el.data.substring(0, 50)}..."`);
        console.log(`      Type: ${el.type}, Classification: ${el.attributes?.type}`);
      });
      
      // Show text elements with header classification
      textElements.filter(el => ['h1','h2','h3','h4','h5'].includes(el.attributes?.type)).forEach((el, idx) => {
        console.log(`   Text-Header ${idx+1}: [${el.attributes?.fontSize}pt] "${el.data.substring(0, 50)}..."`);
        console.log(`      Type: ${el.type}, Classification: ${el.attributes?.type} ❌ SHOULD BE type: header`);
      });
      
      console.log('');
    }
  });
  
})().catch(console.error);
