import { decomposePdf } from './dist/api/decomposePdf.js';

(async () => {
  console.log('🎉 Final elementComposer test...\n');
  
  const result = await decomposePdf('./scripts/test-input/demo.pdf', {
    elementComposer: true,
    assetPath: './test-final'
  });
  
  const page2 = result.find(p => p.pageNumber === 2);
  if (page2) {
    // Look for target paragraph
    const targetParagraph = page2.elements.find(el => 
      el.data.includes('In the midst of Saudi Arabia\'s sweeping wave')
    );
    
    if (targetParagraph) {
      console.log('🎯 TARGET PARAGRAPH FOUND!');
      console.log('Length:', targetParagraph.data.length, 'characters');
      console.log('FontSize:', targetParagraph.attributes?.fontSize);
      console.log('Type:', targetParagraph.type);
      console.log('Composed:', targetParagraph.attributes?.composed);
      console.log('\nFull text:');
      console.log(targetParagraph.data);
      console.log('\n' + '='.repeat(80));
      
      // Compare with original expectation
      const expectedStart = "In the midst of Saudi Arabia's sweeping wave of modernization and transformation, a major development endeavor is underway in the enchanting region of Aseer. Spearheaded by the visionary Mr. Mohammad Alawi, The Point Abha Project emerges as a testament to innovation, seamlessly melding lifestyle, retail, hospitality, and entertainment offerings. Embark on an exclusive one-on-one interview with Mr. Mohammad Alawi as he led us into the dynamic narrative of The Point's Journey.";
      
      const hasFullExpectedContent = targetParagraph.data.includes('endeavor is underway') && 
                                   targetParagraph.data.includes('Point Abha Project') &&
                                   targetParagraph.data.includes('entertainment offerings');
      
      console.log('\n✅ IMPROVEMENT ASSESSMENT:');
      console.log('- Contains "endeavor is underway":', targetParagraph.data.includes('endeavor is underway'));
      console.log('- Contains "Point Abha Project":', targetParagraph.data.includes('Point Abha Project'));
      console.log('- Contains "entertainment offerings":', targetParagraph.data.includes('entertainment offerings'));
      console.log('- Full expected content:', hasFullExpectedContent ? '✅ YES' : '❌ PARTIAL');
      
      if (hasFullExpectedContent) {
        console.log('\n🎉 SUCCESS: Target paragraph is now properly composed as single element!');
      } else {
        console.log('\n⚠️  PARTIAL: Some content still separated, but significant improvement achieved.');
      }
    } else {
      console.log('❌ Target paragraph not found');
    }
  }
})().catch(console.error);
