import { decomposePdf } from './dist/index.js';

(async () => {
  console.log('🔍 DETAILED POSITIONING ANALYSIS FOR PARAGRAPHS...\n');
  
  const rawResult = await decomposePdf('./scripts/test-input/demo.pdf', {
    elementComposer: false,
    assetPath: './test-positioning-details'
  });
  
  const rawPage2 = rawResult.find(p => p.pageNumber === 2);
  if (!rawPage2) return;
  
  // Get all text elements and sort by position
  const textElements = rawPage2.elements
    .filter(el => el.type === 'text' && el.data.trim().length > 0)
    .sort((a, b) => {
      const aTop = a.boundingBox?.top || a.y || 0;
      const bTop = b.boundingBox?.top || b.y || 0;
      return aTop - bTop;
    });
  
  console.log('=== PART 1 PARAGRAPH ANALYSIS ===');
  const part1Elements = textElements.filter(el => 
    el.data.includes('In the midst of Saudi Arabia') ||
    el.data.includes('underway in the enchanting') ||
    el.data.includes('by the visionary Mr. Mohammad') ||
    el.data.includes('Project emerges as a testament') ||
    el.data.includes('offerings. Embark on') ||
    el.data.includes('Mr. Mohammad Alawi as he led')
  );
  
  part1Elements.forEach((el, i) => {
    const top = Math.round(el.boundingBox?.top || el.y || 0);
    const left = Math.round(el.boundingBox?.left || el.x || 0);
    const height = Math.round(el.boundingBox?.height || 12);
    const fontSize = el.attributes?.fontSize || el.font_size || 0;
    const preview = el.data.substring(0, 40);
    
    console.log(`[${i+1}] Y:${top} X:${left} H:${height} F:${fontSize} "${preview}..."`);
    
    if (i > 0) {
      const prev = part1Elements[i-1];
      const prevTop = Math.round(prev.boundingBox?.top || prev.y || 0);
      const prevHeight = Math.round(prev.boundingBox?.height || 12);
      const prevBottom = prevTop + prevHeight;
      const gap = top - prevBottom;
      console.log(`    Gap from previous: ${gap}px (${gap/fontSize}x font size)`);
    }
  });
  
  console.log('\n=== PART 3 PARAGRAPH ANALYSIS ===');
  const part3Elements = textElements.filter(el => 
    el.data.includes('My path into the shopping') ||
    el.data.includes('unexpectedly intriguing') ||
    el.data.includes('in Business Administration') ||
    el.data.includes('my career trajectory') ||
    el.data.includes('managed airport operations') ||
    el.data.includes('estate sector, which owned') ||
    el.data.includes('transition around 1994') ||
    el.data.includes('involvement in the retail') ||
    el.data.includes('engagement with industry')
  );
  
  part3Elements.forEach((el, i) => {
    const top = Math.round(el.boundingBox?.top || el.y || 0);
    const left = Math.round(el.boundingBox?.left || el.x || 0);
    const height = Math.round(el.boundingBox?.height || 12);
    const fontSize = el.attributes?.fontSize || el.font_size || 9.1;
    const preview = el.data.substring(0, 40);
    
    console.log(`[${i+1}] Y:${top} X:${left} H:${height} F:${fontSize} "${preview}..."`);
    
    if (i > 0) {
      const prev = part3Elements[i-1];
      const prevTop = Math.round(prev.boundingBox?.top || prev.y || 0);
      const prevHeight = Math.round(prev.boundingBox?.height || 12);
      const prevBottom = prevTop + prevHeight;
      const gap = top - prevBottom;
      console.log(`    Gap from previous: ${gap}px (${gap/fontSize}x font size)`);
    }
  });
  
  console.log('\n=== PART 5 PARAGRAPH ANALYSIS ===');
  const part5Elements = textElements.filter(el => 
    el.data.includes('With over 30 years') ||
    el.data.includes('excels in managing') ||
    el.data.includes('and shopping malls with top') ||
    el.data.includes('He has played a major role') ||
    el.data.includes('Arabia in key regional') ||
    el.data.includes('mall organizations. Mohammad') ||
    el.data.includes('keynote speaker at economic') ||
    el.data.includes('forums, conferences, and seminars')
  );
  
  part5Elements.forEach((el, i) => {
    const top = Math.round(el.boundingBox?.top || el.y || 0);
    const left = Math.round(el.boundingBox?.left || el.x || 0);
    const height = Math.round(el.boundingBox?.height || 12);
    const fontSize = el.attributes?.fontSize || el.font_size || 9.9;
    const preview = el.data.substring(0, 40);
    
    console.log(`[${i+1}] Y:${top} X:${left} H:${height} F:${fontSize} "${preview}..."`);
    
    if (i > 0) {
      const prev = part5Elements[i-1];
      const prevTop = Math.round(prev.boundingBox?.top || prev.y || 0);
      const prevHeight = Math.round(prev.boundingBox?.height || 12);
      const prevBottom = prevTop + prevHeight;
      const gap = top - prevBottom;
      console.log(`    Gap from previous: ${gap}px (${gap/fontSize}x font size)`);
    }
  });
  
})();
