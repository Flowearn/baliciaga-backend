#!/usr/bin/env python3
import json
import re

def slugify(text):
    """Convert text to URL-friendly slug"""
    # Convert to lowercase
    text = text.lower()
    # Replace spaces with hyphens
    text = re.sub(r'\s+', '-', text)
    # Remove special characters except hyphens
    text = re.sub(r'[^a-z0-9-]', '', text)
    # Replace multiple hyphens with single hyphen
    text = re.sub(r'-+', '-', text)
    # Remove leading/trailing hyphens
    text = text.strip('-')
    return text

# Read the cafes data
with open('cafes-dev.json', 'r', encoding='utf-8') as f:
    cafes = json.load(f)

# Add slug to each cafe
for cafe in cafes:
    cafe['slug'] = slugify(cafe['name'])
    print(f"Added slug: {cafe['name']} -> {cafe['slug']}")

# Save the updated data
with open('cafes-dev.json', 'w', encoding='utf-8') as f:
    json.dump(cafes, f, ensure_ascii=False, indent=2)

print(f"\nTotal cafes updated: {len(cafes)}")
print("cafes-dev.json has been updated with slug field!")

# Also update cafes-prod.json if it exists
try:
    with open('cafes-prod.json', 'r', encoding='utf-8') as f:
        cafes_prod = json.load(f)
    
    for cafe in cafes_prod:
        cafe['slug'] = slugify(cafe['name'])
    
    with open('cafes-prod.json', 'w', encoding='utf-8') as f:
        json.dump(cafes_prod, f, ensure_ascii=False, indent=2)
    
    print(f"\ncafes-prod.json also updated with {len(cafes_prod)} slugs!")
except FileNotFoundError:
    print("\ncafes-prod.json not found, skipping...")