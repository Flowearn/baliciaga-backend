#!/usr/bin/env python3
import json

# 酒吧信息映射
bar_info = {
    "Honeycomb Hookah & Eatery": {
        "barType": ["Hookah Lounge & Restaurant", "水烟酒廊与餐厅"],
        "drinkFocus": ["Hookah", "Cocktails"],
        "atmosphere": ["Chic", "Cozy", "Stylish", "Relaxing"],
        "priceRange": "IDR 200k - 400k",
        "signatureDrinks": [
            "Weekend 2-for-1 Cocktails",
            "Extensive selection of hookah flavors"
        ]
    },
    "LONGTIME": {
        "barType": ["Modern Asian Restaurant & Bar", "现代亚洲餐厅与酒吧"],
        "drinkFocus": ["Cocktails", "Wine"],
        "atmosphere": ["Retro", "Stylish", "Vibrant", "Moody", "DJ Nights"],
        "priceRange": "IDR 400k - 800k+",
        "signatureDrinks": [
            "Signature cocktails",
            "Extensive wine list"
        ]
    },
    "PLATONIC": {
        "barType": ["Cocktail Bar / Speakeasy", "鸡尾酒吧/地下酒吧"],
        "drinkFocus": ["Craft Cocktails"],
        "atmosphere": ["Vintage", "Cozy", "Hidden", "Party Vibe"],
        "priceRange": "IDR 150k - 300k",
        "signatureDrinks": [
            "Hot Girl Summer",
            "Plan B",
            "Miami Coco White",
            "Adults Only"
        ]
    },
    "The Shady Fox": {
        "barType": ["Speakeasy Cocktail Parlour", "地下鸡尾酒廊"],
        "drinkFocus": ["Craft Cocktails", "House-distilled spirits"],
        "atmosphere": ["Theatrical", "Vintage", "Lavish", "Live Jazz"],
        "priceRange": "IDR 200k - 400k",
        "signatureDrinks": [
            "Dern Kala",
            "Shogi Ice Tea",
            "Porn Star",
            "The Chester Cup"
        ]
    },
    "Bali Beer Cycle": {
        "barType": ["Mobile Bar / Party Bus", "移动酒吧/派对巴士"],
        "drinkFocus": ["Beer", "Pre-mixed drinks"],
        "atmosphere": ["Fun", "Social", "Sightseeing", "Party"],
        "priceRange": "IDR 600k (Alcohol Package)",
        "signatureDrinks": [
            "Unlimited Bintang",
            "Unlimited Smirnoff"
        ]
    },
    "The Barn Gastropub": {
        "barType": ["British-style Gastropub / Sports Bar", "英式美食酒吧/体育酒吧"],
        "drinkFocus": ["Draught Beer (Guinness)", "Craft Beer"],
        "atmosphere": ["Traditional", "Cozy", "Sports-Focused", "Family-Friendly"],
        "priceRange": "IDR 150k - 300k",
        "signatureDrinks": [
            "Draught Guinness",
            "Pint of Heineken & Burger deal"
        ]
    },
    "Black Sand Brewery": {
        "barType": ["Craft Brewery & Restaurant", "精酿啤酒厂与餐厅"],
        "drinkFocus": ["Craft Beer (IPA, Kolsch, Blonde, Porter)"],
        "atmosphere": ["Community Vibe", "Beer Garden", "Relaxed", "Spacious"],
        "priceRange": "IDR 200k - 350k",
        "signatureDrinks": [
            "IPA",
            "Kolsch",
            "Blonde Ale",
            "Porter"
        ]
    },
    "Potato Head Beach Club": {
        "barType": ["Beach Club / Lifestyle Destination", "海滩俱乐部/时尚生活目的地"],
        "drinkFocus": ["Signature Cocktails", "Wine"],
        "atmosphere": ["Vibrant", "High-Energy", "DJ Music", "Poolside", "Sunset Views"],
        "priceRange": "IDR 400k - 800k+",
        "signatureDrinks": [
            "Kookaburra",
            "Barong Zombie",
            "Spicy Dragonfruit Margarita",
            "Bina Colada"
        ]
    },
    "Friends Bar": {
        "barType": ["Neighborhood Bar", "邻里酒吧"],
        "drinkFocus": ["Whiskey", "Classic Drinks"],
        "atmosphere": ["Friendly", "Cozy", "Home-Like", "Low-Key"],
        "priceRange": "IDR 50k - 150k",
        "signatureDrinks": [
            "Good whiskey selection",
            "Classic cocktails"
        ]
    },
    "The Lawn Canggu": {
        "barType": ["Beach Club", "海滩俱乐部"],
        "drinkFocus": ["Signature Cocktails", "Spritzes"],
        "atmosphere": ["Beachfront", "Casual Chic", "Lively", "Sunset Views"],
        "priceRange": "IDR 250k - 500k",
        "signatureDrinks": [
            "Aperol Slush",
            "Watermelon Mint Margarita",
            "Sunset Margarita",
            "Frozen Mango Margarita"
        ]
    },
    "The Shady Pig": {
        "barType": ["Experimental Speakeasy Lounge", "实验性地下酒廊"],
        "drinkFocus": ["Experimental & Craft Cocktails"],
        "atmosphere": ["1920s Theme", "Mysterious", "High-End", "Clubby"],
        "priceRange": "IDR 250k - 500k+",
        "signatureDrinks": [
            "Sexy Colada",
            "Banana Old Fashioned",
            "Shelby",
            "The Chester"
        ]
    },
    "Hippie Fish": {
        "barType": ["Restaurant & Rooftop Bar", "餐厅与屋顶酒吧"],
        "drinkFocus": ["Cocktails", "Wine"],
        "atmosphere": ["Beachfront", "Rooftop", "Vibrant", "Boho-Chic"],
        "priceRange": "IDR 150k - 300k",
        "signatureDrinks": [
            "Mediterranean-inspired cocktails",
            "Balinese twist drinks"
        ]
    },
    "Miss Fish Bali": {
        "barType": ["Japanese Fusion Restaurant & Club", "日式融合餐厅与俱乐部"],
        "drinkFocus": ["Signature Cocktails", "High-end Spirits"],
        "atmosphere": ["Chic", "Delicate (Dining)", "High-Energy", "Fiery (Club)"],
        "priceRange": "IDR 400k - 1,000k+",
        "signatureDrinks": [
            "KITSUNE (Bourbon, Butterscotch)",
            "TAKAYUKI (Rum, Mezcal, Pineapple)",
            "I NO NAKA (Tequila, Port, Amareto)"
        ]
    }
}

# 读取JSON文件
with open('bars-dev.json', 'r', encoding='utf-8') as f:
    bars_data = json.load(f)

# 更新每个酒吧的信息
updated_count = 0
for bar in bars_data:
    bar_name = bar.get('name', '')
    
    # 尝试匹配酒吧名称
    matched = False
    for key in bar_info.keys():
        # 进行模糊匹配
        if key.lower() in bar_name.lower() or bar_name.lower() in key.lower():
            bar.update(bar_info[key])
            updated_count += 1
            matched = True
            print(f"Updated: {bar_name}")
            break
    
    if not matched:
        print(f"No match found for: {bar_name}")

# 保存更新后的JSON文件
with open('bars-dev.json', 'w', encoding='utf-8') as f:
    json.dump(bars_data, f, ensure_ascii=False, indent=2)

print(f"\nTotal bars updated: {updated_count}")
print("bars-dev.json has been updated successfully!")