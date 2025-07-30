import { decomposePdf } from './dist/api/decomposePdf.js';

(async () => {
  console.log('🧪 Analyzing paragraph structure...\n');
  
  const result = await decomposePdf('./scripts/test-input/demo.pdf', {
    elementComposer: true,
    assetPath: './test-element-composer'
  });
  
  const page2 = result.find(p => p.pageNumber === 2);
  if (page2) {
    // Filter elements yang kemungkinan adalah bagian dari target paragraph
    const potentialParagraphParts = page2.elements.filter(el => {
      const text = el.data.toLowerCase();
      return (
        text.includes('saudi') || 
        text.includes('modernization') || 
        text.includes('transformation') ||
        text.includes('development') ||
        text.includes('endeavor') ||
        text.includes('aseer') ||
        text.includes('alawi') ||
        text.includes('point') ||
        text.includes('abha') ||
        text.includes('innovation') ||
        text.includes('lifestyle') ||
        text.includes('retail') ||
        text.includes('hospitality') ||
        text.includes('entertainment') ||
        text.includes('interview') ||
        text.includes('narrative') ||
        text.includes('journey')
      );
    });
    
    console.log('=== POTENTIAL PARAGRAPH PARTS ===');
    console.log('Found', potentialParagraphParts.length, 'related elements:');
    
    potentialParagraphParts.forEach((el, i) => {
      console.log(`\n[${i+1}] FontSize: ${el.attributes?.fontSize}, Top: ${el.boundingBox?.top}`);
      console.log('Text:', el.data);
    });
    
    // Reconstruct full paragraph
    console.log('\n=== RECONSTRUCTED PARAGRAPH ===');
    const fullText = potentialParagraphParts
      .sort((a, b) => (a.boundingBox?.top || 0) - (b.boundingBox?.top || 0))
      .map(el => el.data)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    console.log('Full reconstructed text:');
    console.log(fullText);
    console.log('\nLength:', fullText.length, 'characters');
    
    // Analyze gaps between elements
    console.log('\n=== GAP ANALYSIS ===');
    for (let i = 1; i < potentialParagraphParts.length; i++) {
      const prev = potentialParagraphParts[i-1];
      const curr = potentialParagraphParts[i];
      
      const prevBottom = (prev.boundingBox?.top || 0) + (prev.boundingBox?.height || 0);
      const currTop = curr.boundingBox?.top || 0;
      const gap = currTop - prevBottom;
      const fontSize = prev.attributes?.fontSize || 12;
      const gapRatio = gap / fontSize;
      
      console.log(`Gap ${i}: ${gap.toFixed(1)}px (${gapRatio.toFixed(1)}x font size)`);
      console.log(`  From: "${prev.data.substring(0, 30)}..."`);
      console.log(`  To:   "${curr.data.substring(0, 30)}..."`);
    }
  }
})().catch(console.error);
