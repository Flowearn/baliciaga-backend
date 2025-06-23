#!/usr/bin/env python3
"""
Performance Diagnosis Script for Category Switching Delay
Analyzes network requests when switching between categories to identify slow requests.
"""

import asyncio
import json
import time
from datetime import datetime
from playwright.async_api import async_playwright

class PerformanceDiagnoser:
    def __init__(self):
        self.network_requests = []
        self.slow_requests = []
        self.screenshots_taken = []
        self.request_times = {}
        
    async def setup_browser(self):
        """Initialize browser with DevTools and network monitoring"""
        self.playwright = await async_playwright().start()
        # Launch browser with DevTools open
        self.browser = await self.playwright.chromium.launch(
            headless=False,
            devtools=True,
            args=['--disable-web-security', '--disable-features=VizDisplayCompositor']
        )
        self.context = await self.browser.new_context(
            viewport={'width': 1920, 'height': 1080}
        )
        self.page = await self.context.new_page()
        
        # Enable network monitoring using event listeners
        self.page.on("request", self.on_request)
        self.page.on("response", self.on_response)
        
    def on_request(self, request):
        """Handle request events"""
        self.request_times[request.url] = time.time()
        
    def on_response(self, response):
        """Handle response events and capture timing data"""
        try:
            url = response.url
            end_time = time.time()
            start_time = self.request_times.get(url, end_time)
            duration = (end_time - start_time) * 1000  # Convert to milliseconds
            
            request_data = {
                'url': url,
                'method': response.request.method,
                'start_time': start_time,
                'end_time': end_time,
                'duration': duration,
                'status': response.status,
                'size': 0,  # Will be updated if we can get response body
                'headers': dict(response.request.headers),
                'response_headers': dict(response.headers)
            }
            
            self.network_requests.append(request_data)
            
            # Identify slow requests (>1 second)
            if duration > 1000:
                self.slow_requests.append(request_data)
                print(f"SLOW REQUEST DETECTED: {url} took {duration:.2f}ms")
                
        except Exception as e:
            print(f"Error capturing response {response.url}: {e}")
    
    async def navigate_and_wait(self, url):
        """Navigate to URL and wait for page to load completely"""
        print(f"Navigating to {url}...")
        await self.page.goto(url, wait_until='networkidle')
        
        # Wait for category tabs to be visible
        try:
            await self.page.wait_for_selector('text="Food"', timeout=10000)
            await self.page.wait_for_selector('text="Bar"', timeout=10000)
            print("Category tabs loaded successfully")
        except Exception as e:
            print(f"Warning: Could not find category tabs: {e}")
            
        # Take initial screenshot
        screenshot_path = f"/tmp/initial_load_{int(time.time())}.png"
        await self.page.screenshot(path=screenshot_path, full_page=True)
        self.screenshots_taken.append(screenshot_path)
        print(f"Initial screenshot saved: {screenshot_path}")
        
    async def clear_network_logs(self):
        """Clear network request logs to start fresh"""
        self.network_requests.clear()
        self.slow_requests.clear()
        self.request_times.clear()
        print("Network logs cleared")
        
    async def simulate_category_switch(self):
        """Simulate clicking on a different category tab"""
        print("Starting category switch simulation...")
        
        # Clear logs before the action
        await self.clear_network_logs()
        
        # Take screenshot before click
        screenshot_before = f"/tmp/before_click_{int(time.time())}.png"
        await self.page.screenshot(path=screenshot_before, full_page=True)
        self.screenshots_taken.append(screenshot_before)
        
        start_time = time.time()
        
        try:
            # Try to find and click Bar tab (assuming we start on Food)
            bar_tab = await self.page.query_selector('text="Bar"')
            if bar_tab:
                print("Clicking on 'Bar' category tab...")
                await bar_tab.click()
            else:
                # Fallback: try to find any clickable category tab
                category_tabs = await self.page.query_selector_all('[role="tab"], .category-tab, .tab')
                if category_tabs and len(category_tabs) > 1:
                    print("Clicking on alternative category tab...")
                    await category_tabs[1].click()
                else:
                    print("Could not find category tabs to click")
                    return False
                    
        except Exception as e:
            print(f"Error clicking category tab: {e}")
            return False
            
        # Wait for network activity to settle
        print("Waiting for network requests to complete...")
        await asyncio.sleep(8)  # Wait longer than the expected 5-second delay
        
        end_time = time.time()
        total_time = (end_time - start_time) * 1000
        
        # Take screenshot after click
        screenshot_after = f"/tmp/after_click_{int(time.time())}.png"
        await self.page.screenshot(path=screenshot_after, full_page=True)
        self.screenshots_taken.append(screenshot_after)
        
        print(f"Category switch completed in {total_time:.2f}ms")
        return True
        
    async def analyze_network_requests(self):
        """Analyze captured network requests and identify performance issues"""
        print("\n" + "="*80)
        print("NETWORK ANALYSIS RESULTS")
        print("="*80)
        
        if not self.network_requests:
            print("No network requests captured!")
            return
            
        print(f"Total requests captured: {len(self.network_requests)}")
        print(f"Slow requests (>1s): {len(self.slow_requests)}")
        
        # Sort requests by duration
        sorted_requests = sorted(self.network_requests, key=lambda x: x['duration'], reverse=True)
        
        print("\nTOP 10 SLOWEST REQUESTS:")
        print("-" * 80)
        for i, req in enumerate(sorted_requests[:10]):
            print(f"{i+1}. {req['method']} {req['url']}")
            print(f"   Duration: {req['duration']:.2f}ms")
            print(f"   Status: {req['status']}")
            print(f"   Size: {req['size']} bytes")
            print()
            
        # Focus on requests that took more than 3 seconds
        critical_requests = [req for req in self.network_requests if req['duration'] > 3000]
        
        if critical_requests:
            print("\nCRITICAL SLOW REQUESTS (>3 seconds):")
            print("-" * 80)
            for req in critical_requests:
                self.analyze_single_request(req)
        else:
            print("\nNo requests found taking more than 3 seconds.")
            if self.slow_requests:
                print("Analyzing slowest request instead:")
                self.analyze_single_request(sorted_requests[0])
                
    def analyze_single_request(self, request):
        """Detailed analysis of a single slow request"""
        print(f"URL: {request['url']}")
        print(f"Method: {request['method']}")
        print(f"Duration: {request['duration']:.2f}ms ({request['duration']/1000:.2f} seconds)")
        print(f"Status Code: {request['status']}")
        print(f"Response Size: {request['size']} bytes")
        
        # Analyze headers for clues
        if 'content-type' in request.get('response_headers', {}):
            print(f"Content-Type: {request['response_headers']['content-type']}")
            
        # Check if it's an API request
        if '/api/' in request['url'] or request['url'].endswith('.json'):
            print("Type: API Request")
        elif any(ext in request['url'] for ext in ['.js', '.css', '.png', '.jpg', '.gif']):
            print("Type: Static Asset")
        else:
            print("Type: Other/HTML")
            
        print("-" * 40)
        
    async def generate_report(self):
        """Generate a comprehensive performance report"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        report_file = f"/tmp/performance_report_{timestamp}.json"
        
        report_data = {
            'timestamp': timestamp,
            'total_requests': len(self.network_requests),
            'slow_requests_count': len(self.slow_requests),
            'screenshots': self.screenshots_taken,
            'network_requests': self.network_requests,
            'analysis': {
                'slowest_request': max(self.network_requests, key=lambda x: x['duration']) if self.network_requests else None,
                'average_request_time': sum(req['duration'] for req in self.network_requests) / len(self.network_requests) if self.network_requests else 0,
                'requests_over_5s': len([req for req in self.network_requests if req['duration'] > 5000])
            }
        }
        
        with open(report_file, 'w') as f:
            json.dump(report_data, f, indent=2, default=str)
            
        print(f"\nDetailed report saved to: {report_file}")
        print(f"Screenshots saved to: {', '.join(self.screenshots_taken)}")
        
    async def cleanup(self):
        """Clean up browser resources"""
        if hasattr(self, 'browser'):
            await self.browser.close()
        if hasattr(self, 'playwright'):
            await self.playwright.stop()
            
    async def run_diagnosis(self):
        """Main diagnosis workflow"""
        try:
            print("Starting Performance Diagnosis...")
            print("="*50)
            
            # Setup browser automation
            await self.setup_browser()
            
            # Navigate to the application
            await self.navigate_and_wait('http://localhost:8084/')
            
            # Wait a moment for initial load
            await asyncio.sleep(3)
            
            # Simulate category switching
            success = await self.simulate_category_switch()
            
            if success:
                # Analyze the captured requests
                await self.analyze_network_requests()
                
                # Generate detailed report
                await self.generate_report()
            else:
                print("Failed to simulate category switch - check if the application is running")
                
        except Exception as e:
            print(f"Error during diagnosis: {e}")
            import traceback
            traceback.print_exc()
        finally:
            await self.cleanup()

async def main():
    diagnoser = PerformanceDiagnoser()
    await diagnoser.run_diagnosis()

if __name__ == "__main__":
    asyncio.run(main())