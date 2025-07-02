#!/bin/bash

# Simple Healthcare API Test Script
# Tests endpoints without authentication first

set -e

# Configuration
BASE_URL="${API_BASE_URL:-http://localhost:3005}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_header() {
    echo -e "${BLUE}[TEST]${NC} $1"
}

# Function to make HTTP requests
make_request() {
    local method=$1
    local url=$2
    local expected_status=$3

    print_status "Making $method request to $url"

    response=$(curl -s -w "HTTPSTATUS:%{http_code}" -X "$method" "$url")
    
    # Extract HTTP status code
    http_status=$(echo "$response" | tr -d '\n' | sed -e 's/.*HTTPSTATUS://')
    
    # Extract response body
    response_body=$(echo "$response" | sed -e 's/HTTPSTATUS\:.*//g')

    if [ "$http_status" -eq "$expected_status" ]; then
        print_status "✓ Request successful (Status: $http_status)"
        echo "$response_body" | jq . 2>/dev/null || echo "$response_body"
    else
        print_error "✗ Request failed (Expected: $expected_status, Got: $http_status)"
        echo "Response: $response_body"
        return 1
    fi
}

echo "================================================"
echo "Healthcare Management API Simple Test"
echo "Base URL: $BASE_URL"
echo "================================================"

# Test 1: Health Check
print_header "Testing health check endpoint..."
if make_request "GET" "$BASE_URL/health" 200; then
    print_status "Health check passed ✓"
else
    print_error "Health check failed ✗"
    exit 1
fi
echo

# Test 2: Test Endpoint
print_header "Testing debug endpoint..."
if make_request "GET" "$BASE_URL/test" 200; then
    print_status "Test endpoint passed ✓"
else
    print_error "Test endpoint failed ✗"
    exit 1
fi
echo

# Test 3: Metrics Check
print_header "Testing metrics endpoint..."
if make_request "GET" "$BASE_URL/metrics" 200; then
    print_status "Metrics check passed ✓"
else
    print_error "Metrics check failed ✗"
    exit 1
fi
echo

# Test 4: Check FHIR endpoints without auth (should return 401)
print_header "Testing FHIR endpoints without authentication (should return 401)..."

endpoints=("/fhir/Organization" "/fhir/Patient" "/fhir/Practitioner" "/fhir/Appointment")

for endpoint in "${endpoints[@]}"; do
    print_status "Testing $endpoint (expecting 401)..."
    if make_request "GET" "$BASE_URL$endpoint" 401; then
        print_status "✓ $endpoint correctly requires authentication"
    else
        print_error "✗ $endpoint authentication check failed"
    fi
done

echo
echo "================================================"
print_status "Basic connectivity tests completed!"
echo "================================================"

echo "Next steps:"
echo "1. Register a user: POST $BASE_URL/api/auth/register"
echo "2. Login: POST $BASE_URL/api/auth/login"
echo "3. Use the token to access FHIR endpoints"
echo "4. Check documentation: $BASE_URL/docs"