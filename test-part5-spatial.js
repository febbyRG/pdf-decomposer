import { decomposePdf } from './dist/api/decomposePdf.js';

(async () => {
  console.log('🔍 Part 5 Detailed Spatial Analysis\n');
  
  const result = await decomposePdf('./scripts/test-input/demo.pdf', {
    elementComposer: true,
    assetPath: './test-part5-spatial'
  });
  
  const page2 = result.find(p => p.pageNumber === 2);
  if (page2) {
    // Find elements around Mohammad Alawi area (y: 360-380, x: 300-520)
    const candidateElements = page2.elements.filter(el => {
      const bbox = el.boundingBox;
      return bbox && 
             bbox.top >= 350 && bbox.top <= 390 &&
             bbox.left >= 290 && bbox.left <= 530;
    });
    
    console.log(`🎯 Found ${candidateElements.length} elements in Mohammad Alawi area:`);
    candidateElements.forEach((el, idx) => {
      console.log(`${idx + 1}. Type: ${el.type}, FontSize: ${el.attributes?.fontSize}pt`);
      console.log(`   Position: L:${el.boundingBox?.left?.toFixed(1)} T:${el.boundingBox?.top?.toFixed(1)}`);
      console.log(`   Data: "${el.data?.substring(0, 60)}..."`);
      console.log(`   Composed: ${el.attributes?.composed}, Elements: ${el.elements?.length || 0}`);
      
      if (el.elements && el.elements.length > 1) {
        console.log(`   Original elements in composite:`);
        el.elements.forEach((orig, origIdx) => {
          console.log(`     ${origIdx + 1}. "${orig.data?.substring(0, 40)}..."`);
          console.log(`        Pos: L:${orig.boundingBox?.left?.toFixed(1)} T:${orig.boundingBox?.top?.toFixed(1)}`);
        });
      }
      console.log('');
    });
    
    // Analyze spatial gaps between adjacent elements
    if (candidateElements.length > 1) {
      console.log('📏 Spatial Gap Analysis:');
      for (let i = 0; i < candidateElements.length - 1; i++) {
        const current = candidateElements[i];
        const next = candidateElements[i + 1];
        
        const verticalGap = (next.boundingBox?.top || 0) - ((current.boundingBox?.top || 0) + (current.boundingBox?.height || 0));
        const horizontalGap = Math.abs((current.boundingBox?.left || 0) - (next.boundingBox?.left || 0));
        const fontSizeDiff = Math.abs((current.attributes?.fontSize || 12) - (next.attributes?.fontSize || 12));
        
        console.log(`   Gap ${i+1}→${i+2}: V:${verticalGap.toFixed(1)}px H:${horizontalGap.toFixed(1)}px Font:${fontSizeDiff.toFixed(1)}pt`);
        
        // FlexPDF merging criteria check
        const fontTolerance = Math.abs((current.attributes?.fontSize || 12) / (next.attributes?.fontSize || 12) - 1);
        const shouldMerge = fontTolerance <= 0.1; // 10% tolerance
        
        console.log(`   Font tolerance: ${(fontTolerance * 100).toFixed(1)}% (${shouldMerge ? '✅ PASS' : '❌ FAIL'})`);
      }
    }
    
    // FlexPDF algorithm parameters analysis
    const textElements = page2.elements.filter(el => el.type === 'paragraph' && el.attributes?.composed);
    const fontSizes = textElements.map(el => el.attributes?.fontSize || 12);
    const avgFontSize = fontSizes.reduce((sum, size) => sum + size, 0) / fontSizes.length;
    
    console.log('\n📊 FlexPDF Algorithm Parameters:');
    console.log(`   Page average font size: ${avgFontSize.toFixed(2)}pt`);
    console.log(`   Elements analyzed: ${textElements.length}`);
    
    // Check expansion amount calculation for 9.9pt font
    const targetFontSize = 9.9;
    const correctedFontSize = Math.max(Math.pow(targetFontSize, 2) / avgFontSize, targetFontSize);
    const expansionAmount = Math.min(Math.max(correctedFontSize / 3.5, 2), 10);
    
    console.log(`   For ${targetFontSize}pt font:`);
    console.log(`     Corrected font size: ${correctedFontSize.toFixed(2)}pt`);
    console.log(`     Expansion amount: ${expansionAmount.toFixed(2)}px`);
  }
})().catch(console.error);
