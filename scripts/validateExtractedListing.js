const fs = require('fs');
const path = require('path');

/**
 * Validate extracted listing data (same logic as in analyzeListingSource.js)
 */
function validateExtracted(obj) {
    const issues = [];
    
    // Check required core fields
    if (!obj.title) issues.push('missing title');
    if (typeof obj.bedrooms !== 'number') issues.push('bedrooms not number');
    if (typeof obj.bathrooms !== 'number') issues.push('bathrooms not number');
    if (typeof obj.monthlyRent !== 'number') issues.push('monthlyRent not number');
    
    // Check yearly/monthly price consistency if both exist
    if (obj.yearlyRent && obj.monthlyRent && obj.monthlyRentEquivalent) {
        const difference = Math.abs(obj.monthlyRentEquivalent - obj.monthlyRent);
        const percentDiff = (difference / obj.monthlyRent) * 100;
        
        // Use relaxed threshold if priceNote indicates landlord discount
        const threshold = (obj.priceNote && obj.priceNote.includes('discount')) ? 20 : 5;
        
        if (percentDiff >= threshold) {
            issues.push(`yearly/monthly mismatch: ${percentDiff.toFixed(1)}% difference`);
        }
    }
    
    // Allow null values for boolean fields (don't enforce non-null)
    // Allow any locationArea string (don't restrict to predefined list)
    
    // Only warn if completely missing location AND no monthlyRent
    if (!obj.locationArea && !obj.monthlyRent) {
        issues.push('missing both locationArea and monthlyRent');
    }
    
    return {
        isValid: issues.length === 0,
        issues: issues
    };
}

(async () => {
    try {
        const resultsPath = path.join(__dirname, 'analysisResults.json');
        
        if (!fs.existsSync(resultsPath)) {
            console.error('❌ analysisResults.json not found. Please run batchAnalyzeListings.js first.');
            process.exit(1);
        }
        
        const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
        
        console.log('🔍 Validating extracted listing data...\n');
        
        const validationResults = results.map(result => {
            if (!result.aiResponse) {
                return {
                    index: result.index,
                    title: 'N/A',
                    originalIssues: result.issues || [],
                    validationResult: { isValid: false, issues: ['No AI response'] },
                    status: 'ERROR'
                };
            }
            
            const validation = validateExtracted(result.aiResponse);
            
            return {
                index: result.index,
                title: result.aiResponse.title || 'N/A',
                locationArea: result.aiResponse.locationArea || 'N/A',
                monthlyRent: result.aiResponse.monthlyRent || 'N/A',
                yearlyRent: result.aiResponse.yearlyRent || 'N/A',
                monthlyRentEquivalent: result.aiResponse.monthlyRentEquivalent || 'N/A',
                originalIssues: result.issues || [],
                validationResult: validation,
                status: validation.isValid ? 'VALID' : 'INVALID'
            };
        });
        
        // Display validation table
        console.table(validationResults.map(r => ({
            '#': r.index,
            Status: r.status,
            Title: r.title.substring(0, 30) + (r.title.length > 30 ? '...' : ''),
            Location: r.locationArea,
            MonthlyRent: typeof r.monthlyRent === 'number' ? r.monthlyRent.toLocaleString() : r.monthlyRent,
            YearlyRent: typeof r.yearlyRent === 'number' ? r.yearlyRent.toLocaleString() : r.yearlyRent,
            MonthlyEquiv: typeof r.monthlyRentEquivalent === 'number' ? r.monthlyRentEquivalent.toLocaleString() : r.monthlyRentEquivalent,
            'Validation Issues': r.validationResult.issues.join(' | ') || 'None',
            'Original Issues': r.originalIssues.join(' | ') || 'None'
        })));
        
        // Summary statistics
        const validCount = validationResults.filter(r => r.status === 'VALID').length;
        const invalidCount = validationResults.filter(r => r.status === 'INVALID').length;
        const errorCount = validationResults.filter(r => r.status === 'ERROR').length;
        
        console.log(`\n📊 Validation Summary:`);
        console.log(`✅ Valid: ${validCount}`);
        console.log(`⚠️  Invalid: ${invalidCount}`);
        console.log(`❌ Error: ${errorCount}`);
        console.log(`📈 Total: ${validationResults.length}`);
        
        // Detailed issues breakdown
        if (invalidCount > 0 || errorCount > 0) {
            console.log(`\n🔍 Detailed Issues:`);
            validationResults.forEach(r => {
                if (r.status !== 'VALID') {
                    console.log(`\n#${r.index} - ${r.title}`);
                    console.log(`  Status: ${r.status}`);
                    if (r.validationResult.issues.length > 0) {
                        console.log(`  Validation Issues: ${r.validationResult.issues.join(', ')}`);
                    }
                    if (r.originalIssues.length > 0) {
                        console.log(`  Original Issues: ${r.originalIssues.join(', ')}`);
                    }
                }
            });
        }
        
    } catch (error) {
        console.error('❌ Error validating results:', error.message);
        process.exit(1);
    }
})();