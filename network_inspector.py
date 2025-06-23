#!/usr/bin/env python3
"""
Enhanced Network Inspector for Category Switching Performance
Uses Chrome DevTools Protocol to capture detailed network timing information.
"""

import asyncio
import json
import time
from datetime import datetime
from playwright.async_api import async_playwright

class NetworkInspector:
    def __init__(self):
        self.network_data = []
        self.screenshots_taken = []
        self.cdp_session = None
        
    async def setup_browser(self):
        """Initialize browser with CDP enabled"""
        self.playwright = await async_playwright().start()
        self.browser = await self.playwright.chromium.launch(
            headless=False,
            devtools=True,
            args=['--remote-debugging-port=9222']
        )
        self.context = await self.browser.new_context(
            viewport={'width': 1920, 'height': 1080}
        )
        self.page = await self.context.new_page()
        
        # Get CDP session for advanced network monitoring
        self.cdp_session = await self.context.new_cdp_session(self.page)
        
        # Enable network domain
        await self.cdp_session.send('Network.enable')
        await self.cdp_session.send('Page.enable')
        
        # Set up network event handlers
        self.cdp_session.on('Network.requestWillBeSent', self.on_request_sent)
        self.cdp_session.on('Network.responseReceived', self.on_response_received)
        self.cdp_session.on('Network.loadingFinished', self.on_loading_finished)
        self.cdp_session.on('Network.loadingFailed', self.on_loading_failed)
        
    def on_request_sent(self, event):
        """Handle Network.requestWillBeSent events"""
        request_id = event['requestId']
        request = event['request']
        timestamp = event['timestamp']
        
        # Store request data
        self.network_data.append({
            'requestId': request_id,
            'url': request['url'],
            'method': request['method'],
            'headers': request.get('headers', {}),
            'timestamp': timestamp,
            'wallTime': event.get('wallTime'),
            'type': 'request_sent',
            'status': 'pending'
        })
        
    def on_response_received(self, event):
        """Handle Network.responseReceived events"""
        request_id = event['requestId']
        response = event['response']
        timestamp = event['timestamp']
        
        # Find the matching request
        for req in self.network_data:
            if req['requestId'] == request_id and req['type'] == 'request_sent':
                req['response_timestamp'] = timestamp
                req['status'] = response['status']
                req['response_headers'] = response.get('headers', {})
                req['mime_type'] = response.get('mimeType', '')
                req['timing'] = response.get('timing', {})
                break
                
    def on_loading_finished(self, event):
        """Handle Network.loadingFinished events"""
        request_id = event['requestId']
        timestamp = event['timestamp']
        encoded_data_length = event.get('encodedDataLength', 0)
        
        # Update the request with final timing
        for req in self.network_data:
            if req['requestId'] == request_id:
                req['finished_timestamp'] = timestamp
                req['encoded_data_length'] = encoded_data_length
                req['type'] = 'completed'
                
                # Calculate total duration
                if 'response_timestamp' in req:
                    req['duration'] = (timestamp - req['timestamp']) * 1000  # Convert to ms
                    req['ttfb'] = (req['response_timestamp'] - req['timestamp']) * 1000  # Time to first byte
                break
                
    def on_loading_failed(self, event):
        """Handle Network.loadingFailed events"""
        request_id = event['requestId']
        
        # Mark request as failed
        for req in self.network_data:
            if req['requestId'] == request_id:
                req['type'] = 'failed'
                req['error'] = event.get('errorText', 'Unknown error')
                break
                
    async def navigate_and_wait(self, url):
        """Navigate to URL and wait for initial load"""
        print(f"Navigating to {url}...")
        await self.page.goto(url)
        
        # Wait for category tabs
        try:
            await self.page.wait_for_selector('text="Food"', timeout=10000)
            await self.page.wait_for_selector('text="Bar"', timeout=10000)
            print("Category tabs loaded successfully")
        except Exception as e:
            print(f"Warning: Could not find category tabs: {e}")
            
        # Take initial screenshot
        screenshot_path = f"/tmp/network_initial_{int(time.time())}.png"
        await self.page.screenshot(path=screenshot_path, full_page=True)
        self.screenshots_taken.append(screenshot_path)
        print(f"Initial screenshot saved: {screenshot_path}")
        
    async def clear_network_data(self):
        """Clear network data to start fresh"""
        self.network_data.clear()
        # Clear network cache in browser
        await self.cdp_session.send('Network.clearBrowserCache')
        print("Network data and cache cleared")
        
    async def simulate_category_switch(self):
        """Simulate clicking on a different category tab with precise timing"""
        print("\nStarting category switch simulation...")
        
        # Clear previous network data
        await self.clear_network_data()
        await asyncio.sleep(1)  # Wait for cache clear
        
        # Take screenshot before click
        screenshot_before = f"/tmp/network_before_{int(time.time())}.png"
        await self.page.screenshot(path=screenshot_before, full_page=True)
        self.screenshots_taken.append(screenshot_before)
        
        # Record start time
        switch_start_time = time.time()
        print(f"Clicking category tab at {datetime.fromtimestamp(switch_start_time)}")
        
        try:
            # Try to click Bar tab
            bar_tab = await self.page.query_selector('text="Bar"')
            if bar_tab:
                print("Clicking on 'Bar' category tab...")
                await bar_tab.click()
            else:
                # Fallback to any other category tab
                category_tabs = await self.page.query_selector_all('[role="tab"], .category-tab, .tab')
                if category_tabs and len(category_tabs) > 1:
                    print("Clicking on alternative category tab...")
                    await category_tabs[1].click()
                else:
                    print("ERROR: Could not find category tabs to click")
                    return False
                    
        except Exception as e:
            print(f"Error clicking category tab: {e}")
            return False
            
        # Wait for network activity to settle
        print("Waiting for network requests to complete...")
        await asyncio.sleep(8)  # Wait longer than expected 5-second delay
        
        switch_end_time = time.time()
        total_switch_time = (switch_end_time - switch_start_time) * 1000
        
        # Take screenshot after
        screenshot_after = f"/tmp/network_after_{int(time.time())}.png"
        await self.page.screenshot(path=screenshot_after, full_page=True)
        self.screenshots_taken.append(screenshot_after)
        
        print(f"Category switch completed in {total_switch_time:.2f}ms")
        return True
        
    async def analyze_network_performance(self):
        """Analyze captured network data for performance issues"""
        print("\n" + "="*80)
        print("DETAILED NETWORK PERFORMANCE ANALYSIS")
        print("="*80)
        
        if not self.network_data:
            print("No network data captured!")
            return
        
        # Filter completed requests
        completed_requests = [req for req in self.network_data if req.get('type') == 'completed']
        failed_requests = [req for req in self.network_data if req.get('type') == 'failed']
        
        print(f"Total requests: {len(self.network_data)}")
        print(f"Completed requests: {len(completed_requests)}")
        print(f"Failed requests: {len(failed_requests)}")
        
        if failed_requests:
            print("\nFAILED REQUESTS:")
            print("-" * 40)
            for req in failed_requests:
                print(f"URL: {req['url']}")
                print(f"Error: {req.get('error', 'Unknown')}")
                print()
        
        # Sort by duration
        slow_requests = sorted(
            [req for req in completed_requests if req.get('duration', 0) > 1000],
            key=lambda x: x.get('duration', 0),
            reverse=True
        )
        
        print(f"\nSLOW REQUESTS (>1 second): {len(slow_requests)}")
        print("-" * 80)
        
        if slow_requests:
            for i, req in enumerate(slow_requests[:10]):  # Top 10 slowest
                self.analyze_single_request(req, i + 1)
        else:
            # If no slow requests, show the top 5 by duration
            all_sorted = sorted(
                completed_requests,
                key=lambda x: x.get('duration', 0),
                reverse=True
            )
            print("No requests >1 second found. Top 5 requests by duration:")
            print("-" * 60)
            for i, req in enumerate(all_sorted[:5]):
                self.analyze_single_request(req, i + 1)
                
        # Look for API requests specifically
        api_requests = [req for req in completed_requests if '/api/' in req['url'] or req['url'].endswith('.json')]
        if api_requests:
            print(f"\nAPI REQUESTS ANALYSIS ({len(api_requests)} found):")
            print("-" * 60)
            api_sorted = sorted(api_requests, key=lambda x: x.get('duration', 0), reverse=True)
            for i, req in enumerate(api_sorted):
                self.analyze_single_request(req, i + 1, prefix="API")
                
    def analyze_single_request(self, req, index, prefix=""):
        """Detailed analysis of a single request"""
        duration = req.get('duration', 0)
        ttfb = req.get('ttfb', 0)
        
        print(f"{prefix} {index}. {req['method']} {req['url']}")
        print(f"   Status: {req.get('status', 'Unknown')}")
        print(f"   Total Duration: {duration:.2f}ms ({duration/1000:.2f}s)")
        print(f"   Time to First Byte: {ttfb:.2f}ms")
        print(f"   Data Size: {req.get('encoded_data_length', 0)} bytes")
        
        # Analyze timing breakdown if available
        timing = req.get('timing', {})
        if timing:
            print(f"   Timing Breakdown:")
            if 'dnsLookup' in timing:
                dns_time = timing.get('dnsEnd', 0) - timing.get('dnsStart', 0)
                print(f"     DNS Lookup: {dns_time:.2f}ms")
            if 'connectStart' in timing:
                connect_time = timing.get('connectEnd', 0) - timing.get('connectStart', 0)
                print(f"     Connection: {connect_time:.2f}ms")
            if 'sendStart' in timing:
                send_time = timing.get('sendEnd', 0) - timing.get('sendStart', 0)
                print(f"     Send: {send_time:.2f}ms")
            if 'receiveHeadersEnd' in timing:
                wait_time = timing.get('receiveHeadersEnd', 0) - timing.get('sendEnd', 0)
                print(f"     Wait (Server Processing): {wait_time:.2f}ms")
                
        # Identify request type
        url = req['url']
        if '/api/' in url or url.endswith('.json'):
            req_type = "API Request"
        elif any(ext in url for ext in ['.js', '.css']):
            req_type = "Static Asset (JS/CSS)"
        elif any(ext in url for ext in ['.png', '.jpg', '.gif', '.webp']):
            req_type = "Image"
        else:
            req_type = "Other/HTML"
            
        print(f"   Type: {req_type}")
        print()
        
    async def generate_detailed_report(self):
        """Generate comprehensive network performance report"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        report_file = f"/tmp/network_performance_report_{timestamp}.json"
        
        # Prepare report data
        completed_requests = [req for req in self.network_data if req.get('type') == 'completed']
        slow_requests = [req for req in completed_requests if req.get('duration', 0) > 3000]
        api_requests = [req for req in completed_requests if '/api/' in req['url']]
        
        report_data = {
            'timestamp': timestamp,
            'analysis_summary': {
                'total_requests': len(self.network_data),
                'completed_requests': len(completed_requests),
                'slow_requests_3s_plus': len(slow_requests),
                'api_requests': len(api_requests),
                'slowest_request': max(completed_requests, key=lambda x: x.get('duration', 0)) if completed_requests else None,
                'average_duration': sum(req.get('duration', 0) for req in completed_requests) / len(completed_requests) if completed_requests else 0
            },
            'screenshots': self.screenshots_taken,
            'network_data': self.network_data,
            'slow_requests': slow_requests,
            'api_requests': api_requests
        }
        
        with open(report_file, 'w') as f:
            json.dump(report_data, f, indent=2, default=str)
            
        print(f"\nDetailed network report saved to: {report_file}")
        return report_file
        
    async def cleanup(self):
        """Clean up resources"""
        if self.cdp_session:
            await self.cdp_session.detach()
        if hasattr(self, 'browser'):
            await self.browser.close()
        if hasattr(self, 'playwright'):
            await self.playwright.stop()
            
    async def run_diagnosis(self):
        """Main diagnosis workflow"""
        try:
            print("Starting Enhanced Network Performance Diagnosis...")
            print("="*60)
            
            await self.setup_browser()
            await self.navigate_and_wait('http://localhost:8084/')
            
            # Wait for initial page to stabilize
            await asyncio.sleep(3)
            
            # Perform category switch
            success = await self.simulate_category_switch()
            
            if success:
                # Analyze network performance
                await self.analyze_network_performance()
                
                # Generate detailed report
                report_file = await self.generate_detailed_report()
                
                print(f"\nScreenshots captured:")
                for screenshot in self.screenshots_taken:
                    print(f"  - {screenshot}")
                    
                return report_file
            else:
                print("Failed to simulate category switch")
                return None
                
        except Exception as e:
            print(f"Error during diagnosis: {e}")
            import traceback
            traceback.print_exc()
            return None
        finally:
            await self.cleanup()

async def main():
    inspector = NetworkInspector()
    await inspector.run_diagnosis()

if __name__ == "__main__":
    asyncio.run(main())