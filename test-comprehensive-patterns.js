import { decomposePdf } from './dist/index.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testComprehensivePatterns() {
  console.log('Testing comprehensive pattern-based paragraph detection...\n');
  
  try {
    // Test with demo.pdf page 2
    const pdfPath = path.join(__dirname, '../editor/public/demo.pdf');
    
    const options = {
      elementComposer: true,
      targetPage: 2
    };
    
    const result = await decomposePdf(pdfPath, options);
    
    console.log('Result structure:', Object.keys(result));
    console.log('Total pages found:', Object.keys(result).length);
    
    // Get page 2 elements (index 1 since 0-based)
    const page2 = result[1]; // Page 2 is at index 1
    if (!page2) {
      console.log('Page 2 not found');
      return;
    }
    
    console.log('Page 2 structure:', Object.keys(page2));
    const elements = page2.elements;
    
    console.log(`=== COMPREHENSIVE PATTERNS TEST ===`);
    console.log(`Elements: ${elements.length} (target: focused on 5 semantic parts)`);
    console.log(`Font sizes found: ${[...new Set(elements.map(e => e.attributes?.fontSize || 'unknown'))].sort().join(', ')}`);
    
    // Analyze composition results
    let partCount = 0;
    
    elements.forEach((element, index) => {
      const text = (element.formattedData || element.data || '').trim();
      const fontSize = element.attributes?.fontSize || 'unknown';
      
      if (text.length > 100) { // Likely composed paragraphs
        partCount++;
        
        console.log(`\n--- COMPOSED PART ${partCount} (${text.length} chars, font: ${fontSize}) ---`);
        console.log(`Text preview: "${text.substring(0, 120)}${text.length > 120 ? '...' : ''}"`);
        
        // Check for specific target patterns
        if (text.includes('Journey')) {
          console.log('✅ PART 1 (Journey) identified');
        } else if (text.includes('industry?') || text.includes('Can you')) {
          console.log('✅ PART 2 (Question) identified');
        } else if (text.includes('ICSC') || text.includes('shopping')) {
          console.log('✅ PART 3 (Experience) identified');
        } else if (text.includes('seminars') || text.includes('With over')) {
          console.log('✅ PART 5 (Bio) identified');
        }
      } else if (text.length > 20) {
        console.log(`\nShort element ${index + 1} (${text.length} chars, font: ${fontSize}): "${text.substring(0, 60)}${text.length > 60 ? '...' : ''}"`);
      }
    });
    
    console.log(`\n=== SUMMARY ===`);
    console.log(`Total elements: ${elements.length}`);
    console.log(`Likely composed paragraphs: ${partCount}`);
    console.log(`Target: 5 semantic parts properly composed`);
    
    // Success criteria
    const hasGoodReduction = elements.length < 30; // Should be much less than 78
    const hasProperParts = partCount >= 3; // Should have main semantic parts
    
    if (hasGoodReduction && hasProperParts) {
      console.log('✅ SUCCESS: Comprehensive patterns working well!');
    } else {
      console.log('⚠️  PARTIAL: Some improvements needed');
    }
    
  } catch (error) {
    console.error('Test error:', error.message);
    console.error(error.stack);
  }
}

testComprehensivePatterns();
