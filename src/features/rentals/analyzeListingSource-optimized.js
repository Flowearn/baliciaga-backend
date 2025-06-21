/**
 * 优化版本的Listing Source Analysis - 修复了年租金转换、最短租期提取、面积处理、精确地址等问题
 */

function constructOptimizedAnalysisPrompt(sourceText) {
    // Normalize price text before analysis
    const normalizedText = sourceText.replace(/(?<=\d)[,.](?=\d{3}\b)/g, '');
    
    const optimizedPrompt = `
You are a hyper-precise data extraction engine for real estate in Bali, Indonesia. Your ONLY task is to populate a JSON object based *only* on the provided source material.

<critical_instructions>
  <rule id="1" importance="ABSOLUTE_HIGHEST">
    **MINIMUM STAY EXTRACTION:** Look for patterns like: "minimum X months", "min X year", "Minimum Y months lease", "Lease: Minimum Z months", "min Take X Year". Extract the EXACT number and unit. Convert to months (1 year = 12 months, 3 years = 36 months). If not found, use null.
  </rule>
  <rule id="2" importance="ABSOLUTE_HIGHEST">
    **AREA SIZE EXTRACTION:** Look for land/building sizes in various formats: "3 Are" (1 Are = 100 sqm), "500sqm", "500 sqm", "500 m2", "Landsize 3 Are", "land size X sqm". Convert everything to square meters. If not found, use null.
  </rule>
  <rule id="3" importance="ABSOLUTE_HIGHEST">
    **YEAR TO MONTH PRICE CONVERSION:** If only yearly price is given ("275 mill / Year", "65 million IDR/year"), divide by 12 to get monthly rent. If both yearly and monthly prices exist, use the monthly price directly.
  </rule>
  <rule id="4" importance="ABSOLUTE_HIGHEST">
    **PRECISE ADDRESS EXTRACTION:** Do NOT default to "Bali". Extract the specific area mentioned: "Canggu", "Seminyak", "Ubud", "Pererenan", "Berawa", "Kerobokan", "Padang Linjong", "Seseh", etc. Only use "Bali" if NO specific area is mentioned.
  </rule>
  <rule id="5" importance="HIGH">
    **CURRENCY DETECTION:** If the price is mentioned with a '$' symbol OR the word 'USD', the 'currency' field MUST be 'USD'. In ALL other cases, assume the currency is 'IDR'.
  </rule>
  <rule id="6">
    **NO HALLUCINATIONS:** If information is NOT explicitly written in the source material, the value MUST be null. Do NOT guess or default values.
  </rule>
</critical_instructions>

<json_structure>
{
  "title": "string",
  "bedrooms": "number | null",
  "bathrooms": "number | null", 
  "landSize": "number | null",
  "buildingSize": "number | null",
  "address": "string | null",
  "currency": "'USD' | 'IDR'",
  "pricing": {
    "monthly": "number | null",
    "yearly": "number | null"
  },
  "minimumStay": "string | null",
  "amenityTags": ["string"],
  "reasoning": "string"
}
</json_structure>

<examples>
  <example id="yearly_to_monthly">
    <source>Available Now Brand New Villa in padang Linjong Price 275 mill / Year min Take 3 Year - 3 Bedroom - 3 Bathroom - Landsize 3 Are</source>
    <output>
    {
      "title": "Brand New Villa in Padang Linjong",
      "bedrooms": 3,
      "bathrooms": 3,
      "landSize": 300,
      "buildingSize": null,
      "address": "Padang Linjong", 
      "currency": "IDR",
      "pricing": {
        "monthly": 22916667,
        "yearly": 275000000
      },
      "minimumStay": "36 months",
      "amenityTags": ["Brand New", "Unfurnished"],
      "reasoning": "Yearly price 275 million ÷ 12 = 22,916,667 monthly. Min Take 3 Year = 36 months. Landsize 3 Are = 300 sqm. Address is Padang Linjong, not generic Bali."
    }
    </output>
  </example>
  
  <example id="usd_with_min_stay">
    <source>Villa Pererenan $2,200 USD/month, Lease: Minimum 12 months</source>
    <output>
    {
      "title": "Villa in Pererenan",
      "bedrooms": null,
      "bathrooms": null,
      "landSize": null,
      "buildingSize": null,
      "address": "Pererenan",
      "currency": "USD", 
      "pricing": {
        "monthly": 2200,
        "yearly": null
      },
      "minimumStay": "12 months",
      "amenityTags": [],
      "reasoning": "Currency is USD due to '$' and 'USD'. Minimum 12 months lease extracted. Address is Pererenan."
    }
    </output>
  </example>
  
  <example id="sqm_extraction">
    <source>Stunning 4BR villa with rice field views! 500sqm land size. 65 million IDR/year in Ubud</source>
    <output>
    {
      "title": "Rice Field Villa in Ubud",
      "bedrooms": 4,
      "bathrooms": null,
      "landSize": 500,
      "buildingSize": null,
      "address": "Ubud",
      "currency": "IDR",
      "pricing": {
        "monthly": 5416667,
        "yearly": 65000000
      },
      "minimumStay": null,
      "amenityTags": ["rice field views"],
      "reasoning": "500sqm land size extracted. Yearly 65 million ÷ 12 = 5,416,667 monthly. Address is Ubud."
    }
    </output>
  </example>
</examples>

Now, analyze the following source material and provide the JSON output:
${normalizedText}
    `;
    
    return optimizedPrompt;
}

module.exports = { constructOptimizedAnalysisPrompt }; 