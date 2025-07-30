import { decomposePdf } from './dist/api/decomposePdf.js';

(async () => {
  console.log('🧪 Testing New Clean Implementation...\n');
  
  const result = await decomposePdf('./scripts/test-input/demo.pdf', {
    elementComposer: true,
    assetPath: './test-clean'
  });
  
  const page2 = result.find(p => p.pageNumber === 2);
  if (page2) {
    console.log(`📄 Page 2 has ${page2.elements.length} elements\n`);
    
    // Find composed paragraphs
    const composedParagraphs = page2.elements.filter(el => 
      el.attributes?.composed
    );
    
    console.log(`📝 Found ${composedParagraphs.length} composed paragraphs:\n`);
    
    composedParagraphs.forEach((para, index) => {
      console.log(`=== PARAGRAPH ${index + 1} ===`);
      console.log('Length:', para.data.length, 'characters');
      console.log('FontSize:', para.attributes?.fontSize);
      console.log('Composed:', para.attributes?.composed);
      console.log('Type:', para.type);
      console.log('First 150 chars:', para.data.substring(0, 150) + '...');
      console.log('');
    });
    
    // Check for the target paragraph
    const part1Found = composedParagraphs.find(para => 
      para.data.includes('In the midst of Saudi Arabia\'s sweeping wave')
    );
    
    console.log('🎯 RESULTS:');
    console.log('Part 1 found:', !!part1Found);
    if (part1Found) {
      console.log('Part 1 length:', part1Found.data.length);
      console.log('Contains full content:', part1Found.data.includes('entertainment offerings'));
    }
    
    console.log('\n✅ New implementation test complete!');
  }
})().catch(console.error);
