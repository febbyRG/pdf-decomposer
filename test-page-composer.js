import { decomposePdf } from './dist/api/decomposePdf.js';

(async () => {
  console.log('🔍 Page Composer Analysis\n');
  
  const result = await decomposePdf('./scripts/test-input/demo.pdf', {
    elementComposer: true,
    pageComposer: true,
    assetPath: './test-page-composer'
  });
  
  console.log(`📄 Page Composer Results:`);
  console.log(`   Original pages: 6`);
  console.log(`   Composed pages: ${result.length}`);
  
  console.log(`\n📊 Page Composition Details:`);
  result.forEach((page, idx) => {
    console.log(`Page ${idx + 1}:`);
    console.log(`   Title: "${page.title}"`);
    console.log(`   Page numbers: ${page.pageNumber} (${page.pageIndex})`);
    console.log(`   Elements: ${page.elements.length}`);
    
    // Show first few elements to understand content
    const textElements = page.elements.filter(el => ['paragraph', 'text', 'header'].includes(el.type));
    console.log(`   Text elements: ${textElements.length}`);
    
    if (textElements.length > 0) {
      console.log(`   First content: "${(textElements[0].data || '').substring(0, 60)}..."`);
      console.log(`   Last content: "${(textElements[textElements.length - 1].data || '').substring(0, 60)}..."`);
    }
    console.log('');
  });
  
  // Check expected composition:
  // Page 1: Cover (standalone)
  // Pages 2,3,4: Interview content (should merge)
  // Pages 5,6: Future content (should merge)
  
  console.log(`\n🎯 Expected Composition Analysis:`);
  console.log(`   Expected: 3 composed pages`);
  console.log(`   - Page 1: Cover (standalone)`);
  console.log(`   - Pages 2-4: Interview content (merged)`);
  console.log(`   - Pages 5-6: Future content (merged)`);
  console.log(`   Actual: ${result.length} composed pages`);
  
  const isCorrectComposition = result.length === 3;
  console.log(`   ✅ Composition ${isCorrectComposition ? 'CORRECT' : 'INCORRECT'}`);
  
})().catch(console.error);
