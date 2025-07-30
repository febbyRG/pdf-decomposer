import { decomposePdf } from './dist/index.js';

(async () => {
  console.log('🎯 FOCUSED PARAGRAPH COMPOSITION ANALYSIS...\n');
  
  // Test without elementComposer to see raw elements
  const rawResult = await decomposePdf('./scripts/test-input/demo.pdf', {
    elementComposer: false,
    assetPath: './test-paragraph-raw'
  });
  
  // Test with elementComposer
  const composedResult = await decomposePdf('./scripts/test-input/demo.pdf', {
    elementComposer: true,
    assetPath: './test-paragraph-composed'
  });
  
  const rawPage2 = rawResult.find(p => p.pageNumber === 2);
  const composedPage2 = composedResult.find(p => p.pageNumber === 2);
  
  if (!rawPage2 || !composedPage2) {
    console.log('❌ Page 2 not found');
    return;
  }
  
  console.log(`📊 RAW vs COMPOSED:`);
  console.log(`Raw elements: ${rawPage2.elements.length}`);
  console.log(`Composed elements: ${composedPage2.elements.length}`);
  console.log(`Reduction: ${rawPage2.elements.length - composedPage2.elements.length} elements`);
  
  console.log('\n🔍 ANALYZING PARAGRAPH FRAGMENTS...\n');
  
  // Part 1: Opening paragraph (should be one element)
  console.log('=== PART 1: Opening Paragraph ===');
  const part1Raw = rawPage2.elements.filter(el => 
    el.type === 'text' && 
    (el.data.includes('In the midst of Saudi Arabia') ||
     el.data.includes('underway in the enchanting') ||
     el.data.includes('by the visionary Mr. Mohammad') ||
     el.data.includes('Project emerges as a testament') ||
     el.data.includes('melding lifestyle') ||
     el.data.includes('offerings. Embark on') ||
     el.data.includes('Mr. Mohammad Alawi as he led') ||
     el.data.includes('of The Point\'s Journey'))
  );
  
  console.log(`Raw fragments: ${part1Raw.length} elements`);
  part1Raw.forEach((el, i) => {
    const preview = el.data.substring(0, 50).replace(/\s+/g, ' ');
    console.log(`  [${i+1}] "${preview}..."`);
  });
  
  const part1Composed = composedPage2.elements.find(el => 
    el.data.includes('In the midst of Saudi Arabia') && el.data.includes('of The Point\'s Journey')
  );
  console.log(`Composed: ${part1Composed ? '✅ Single element' : '❌ Still fragmented'}`);
  if (part1Composed) {
    console.log(`  Length: ${part1Composed.data.length} chars`);
  }
  
  // Part 3: Answer paragraph (should be one element)
  console.log('\n=== PART 3: Answer Paragraph ===');
  const part3Raw = rawPage2.elements.filter(el => 
    el.type === 'text' && 
    (el.data.includes('My path into the shopping') ||
     el.data.includes('unexpectedly intriguing') ||
     el.data.includes('in Business Administration') ||
     el.data.includes('my career trajectory') ||
     el.data.includes('managed airport operations') ||
     el.data.includes('estate sector, which owned') ||
     el.data.includes('transition around 1994') ||
     el.data.includes('involvement in the retail') ||
     el.data.includes('engagement with industry'))
  );
  
  console.log(`Raw fragments: ${part3Raw.length} elements`);
  part3Raw.forEach((el, i) => {
    const preview = el.data.substring(0, 50).replace(/\s+/g, ' ');
    console.log(`  [${i+1}] "${preview}..."`);
  });
  
  const part3Composed = composedPage2.elements.find(el => 
    el.data.includes('My path into the shopping') && el.data.includes('engagement with industry')
  );
  console.log(`Composed: ${part3Composed ? '✅ Single element' : '❌ Still fragmented'}`);
  if (part3Composed) {
    console.log(`  Length: ${part3Composed.data.length} chars`);
  }
  
  // Part 5: Bio paragraph (should be one element)
  console.log('\n=== PART 5: Bio Paragraph ===');
  const part5Raw = rawPage2.elements.filter(el => 
    el.type === 'text' && 
    (el.data.includes('With over 30 years') ||
     el.data.includes('excels in managing') ||
     el.data.includes('and shopping malls with top') ||
     el.data.includes('He has played a major role') ||
     el.data.includes('Arabia in key regional') ||
     el.data.includes('mall organizations. Mohammad') ||
     el.data.includes('keynote speaker at economic') ||
     el.data.includes('forums, conferences, and seminars'))
  );
  
  console.log(`Raw fragments: ${part5Raw.length} elements`);
  part5Raw.forEach((el, i) => {
    const preview = el.data.substring(0, 50).replace(/\s+/g, ' ');
    console.log(`  [${i+1}] "${preview}..."`);
  });
  
  const part5Composed = composedPage2.elements.find(el => 
    el.data.includes('With over 30 years') && el.data.includes('conferences, and seminars')
  );
  console.log(`Composed: ${part5Composed ? '✅ Single element' : '❌ Still fragmented'}`);
  if (part5Composed) {
    console.log(`  Length: ${part5Composed.data.length} chars`);
  }
  
  console.log('\n🎯 TARGET: Part 1, 3, 5 should each be single coherent paragraphs');
  
})();
