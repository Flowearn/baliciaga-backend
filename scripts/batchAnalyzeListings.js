const { sampleListings } = require('./listingSamples');
const { handler } = require('../src/features/rentals/analyzeListingSource');
const fs = require('fs');
const path = require('path');

(async () => {
  const allowedAreas = ['Canggu','Ubud','Pererenan','Seminyak','Uluwatu','Kedungu','Kerobokan','Bingin'];
  const results = [];
  
  console.log('🚀 Starting batch analysis of', sampleListings.length, 'listings...\n');
  
  for (let i = 0; i < sampleListings.length; i++) {
    const raw = sampleListings[i];
    console.log(`📝 Analyzing listing ${i + 1}/${sampleListings.length}...`);
    
    try {
      // Create mock Lambda event
      const mockEvent = {
        requestContext: {
          authorizer: {
            claims: {
              sub: 'batch-analysis-user'
            }
          }
        },
        body: JSON.stringify({
          sourceText: raw
        })
      };
      
      // Call the Lambda handler
      const response = await handler(mockEvent);
      const responseBody = JSON.parse(response.body);
      
      if (!responseBody.success) {
        throw new Error(`API Error: ${responseBody.error?.message || 'Unknown error'}`);
      }
      
      const aiResponse = responseBody.data.extractedListing.aiExtractedData;
      const issues = [];
      
      const {
        title, locationArea, bedrooms, bathrooms, monthlyRent,
        yearlyRent, furnished, petFriendly, smokingAllowed, amenities
      } = aiResponse;

      // 基本必填检查
      if (!title) issues.push('missing title');
      if (!allowedAreas.includes(locationArea)) issues.push('locationArea invalid');
      if (typeof monthlyRent !== 'number') issues.push('monthlyRent not number');
      if (yearlyRent && monthlyRent && Math.abs(yearlyRent/12 - monthlyRent) > 1000) issues.push('yearly/monthly mismatch');
      if (!Array.isArray(amenities)) issues.push('amenities not array');
      if (typeof furnished !== 'boolean') issues.push('furnished not boolean');
      if (typeof petFriendly !== 'boolean') issues.push('petFriendly not boolean');
      if (typeof smokingAllowed !== 'boolean') issues.push('smokingAllowed not boolean');

      results.push({ 
        index: i + 1,
        raw: raw.substring(0, 100) + '...', 
        aiResponse, 
        issues,
        status: issues.length === 0 ? 'OK' : 'ISSUES'
      });
      
      console.log(`   ✅ ${issues.length === 0 ? 'OK' : '⚠️  Issues: ' + issues.join(', ')}`);
      
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
      results.push({
        index: i + 1,
        raw: raw.substring(0, 100) + '...',
        aiResponse: null,
        issues: [`Error: ${error.message}`],
        status: 'ERROR'
      });
    }
  }

  // Save detailed results
  const outPath = path.join(__dirname, 'analysisResults.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  
  // Display summary table
  console.log('\n📊 Analysis Summary:');
  console.table(results.map(r => ({ 
    '#': r.index,
    Status: r.status,
    Title: r.aiResponse?.title || 'N/A',
    Location: r.aiResponse?.locationArea || 'N/A',
    MonthlyRent: r.aiResponse?.monthlyRent || 'N/A',
    Issues: r.issues.join(' | ') || 'None'
  })));
  
  const successCount = results.filter(r => r.status === 'OK').length;
  const issueCount = results.filter(r => r.status === 'ISSUES').length;
  const errorCount = results.filter(r => r.status === 'ERROR').length;
  
  console.log(`\n📈 Results: ${successCount} OK, ${issueCount} with issues, ${errorCount} errors`);
  console.log(`📁 Detailed results saved to: ${outPath}`);
})();