#!/usr/bin/env python3
"""
Analyze JSON files to check if photo URLs match expected S3 album paths
"""

import json
import re
from collections import defaultdict
from pathlib import Path

def extract_album_paths(photos):
    """Extract unique album paths from photo URLs"""
    album_paths = set()
    for photo in photos:
        if isinstance(photo, str):
            # Extract the album path from the URL
            match = re.search(r'https://[^/]+/(.+?)/[^/]+$', photo)
            if match:
                album_paths.add(match.group(1))
    return album_paths

def analyze_json_file(file_path):
    """Analyze a single JSON file for photo URLs"""
    results = {
        'file': file_path.name,
        'total_items': 0,
        'items_with_photos': 0,
        'total_photos': 0,
        'album_paths': set(),
        'anomalies': []
    }
    
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        results['total_items'] = len(data)
        
        for item in data:
            if 'photos' in item and item['photos']:
                results['items_with_photos'] += 1
                results['total_photos'] += len(item['photos'])
                
                # Extract album paths from this item's photos
                album_paths = extract_album_paths(item['photos'])
                results['album_paths'].update(album_paths)
                
                # Check for anomalies in photo URLs
                for photo in item['photos']:
                    if not photo.startswith('https://'):
                        results['anomalies'].append(f"Non-HTTPS URL: {photo}")
                    elif 'baliciaga-media.s3' not in photo:
                        results['anomalies'].append(f"Non-S3 URL: {photo}")
    
    except Exception as e:
        results['anomalies'].append(f"Error reading file: {str(e)}")
    
    return results

def main():
    """Main analysis function"""
    # Define expected patterns for each category
    expected_patterns = {
        'cafes': 'cafes',
        'dining': 'dining',
        'bars': 'bars',
        'cowork': 'cowork'
    }
    
    # Files to analyze
    files = [
        'cafes-dev.json', 'cafes.json',
        'dining-dev.json', 'dining.json',
        'bars-dev.json', 'bars.json',
        'cowork-dev.json'
    ]
    
    # Analyze each file
    results = []
    for file_name in files:
        file_path = Path(file_name)
        if file_path.exists():
            analysis = analyze_json_file(file_path)
            
            # Determine category and environment
            if '-dev' in file_name:
                env = 'dev'
                category = file_name.replace('-dev.json', '')
            else:
                env = 'prod'
                category = file_name.replace('.json', '')
            
            # Check if album paths match expected pattern
            expected = expected_patterns.get(category, category)
            matches_expected = any(expected in path for path in analysis['album_paths'])
            
            results.append({
                'category': category,
                'env': env,
                'file': file_name,
                'total_items': analysis['total_items'],
                'items_with_photos': analysis['items_with_photos'],
                'total_photos': analysis['total_photos'],
                'album_paths': list(analysis['album_paths']),
                'matches_expected': matches_expected,
                'anomalies': analysis['anomalies']
            })
    
    # Generate markdown table
    print("# S3 Photo URL Analysis\n")
    print("| Category | Environment | File Name | Total Items | Items w/ Photos | Total Photos | Album Paths | Matches Expected | Anomalies |")
    print("|----------|-------------|-----------|-------------|-----------------|--------------|-------------|------------------|-----------|")
    
    for r in results:
        album_paths_str = ', '.join(sorted(r['album_paths'])) if r['album_paths'] else 'None'
        anomalies_str = f"{len(r['anomalies'])} found" if r['anomalies'] else "None"
        matches = "✅" if r['matches_expected'] else "❌"
        
        print(f"| {r['category']} | {r['env']} | {r['file']} | {r['total_items']} | {r['items_with_photos']} | {r['total_photos']} | {album_paths_str} | {matches} | {anomalies_str} |")
    
    # Print detailed anomalies if any
    print("\n## Detailed Analysis\n")
    for r in results:
        if r['anomalies'] or not r['matches_expected']:
            print(f"### {r['file']}")
            if r['anomalies']:
                print("**Anomalies:**")
                for anomaly in r['anomalies'][:5]:  # Show first 5 anomalies
                    print(f"- {anomaly}")
                if len(r['anomalies']) > 5:
                    print(f"- ... and {len(r['anomalies']) - 5} more")
            if not r['matches_expected']:
                print(f"**Warning:** Album paths {r['album_paths']} do not match expected pattern '{expected_patterns.get(r['category'], r['category'])}'")
            print()

if __name__ == "__main__":
    main()