#!/bin/bash

# Debug Authentication Test Script
# Tests the authentication flow step by step

set -e

# Configuration
BASE_URL="${API_BASE_URL:-http://197.231.176.18:3005}"
EMAIL="admin@hospital.com"
PASSWORD="SecurePassword123!"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_header() {
    echo -e "${BLUE}[TEST]${NC} $1"
}

echo "================================================"
echo "Healthcare API Authentication Debug Test"
echo "Base URL: $BASE_URL"
echo "Email: $EMAIL"
echo "================================================"

# Step 1: Test health endpoint
print_header "Step 1: Testing health endpoint..."
health_response=$(curl -s "$BASE_URL/health")
echo "Health Response: $health_response"
echo

# Step 2: Login and get token
print_header "Step 2: Logging in..."
login_data='{
    "email": "'$EMAIL'",
    "password": "'$PASSWORD'"
}'

login_response=$(curl -s -w "HTTPSTATUS:%{http_code}" -X POST "$BASE_URL/api/auth/login" \
    -H "Content-Type: application/json" \
    -d "$login_data")

# Extract HTTP status code
http_status=$(echo "$login_response" | tr -d '\n' | sed -e 's/.*HTTPSTATUS://')
response_body=$(echo "$login_response" | sed -e 's/HTTPSTATUS\:.*//g')

echo "Login Status: $http_status"
echo "Login Response: $response_body"

if [ "$http_status" -eq "200" ]; then
    # Extract token
    TOKEN=$(echo "$response_body" | grep -o '"token":"[^"]*"' | sed 's/"token":"//g' | sed 's/"//g')
    print_status "Login successful! Token: ${TOKEN:0:20}..."
    echo
else
    print_error "Login failed!"
    exit 1
fi

# Step 3: Test user info endpoint
print_header "Step 3: Getting user info..."
user_info_response=$(curl -s -w "HTTPSTATUS:%{http_code}" -X GET "$BASE_URL/api/auth/me" \
    -H "Authorization: Bearer $TOKEN")

user_status=$(echo "$user_info_response" | tr -d '\n' | sed -e 's/.*HTTPSTATUS://')
user_body=$(echo "$user_info_response" | sed -e 's/HTTPSTATUS\:.*//g')

echo "User Info Status: $user_status"
echo "User Info Response: $user_body"
echo

# Step 4: Test FHIR Organization endpoint
print_header "Step 4: Testing FHIR Organization endpoint..."
org_response=$(curl -s -w "HTTPSTATUS:%{http_code}" -X GET "$BASE_URL/fhir/Organization" \
    -H "Authorization: Bearer $TOKEN")

org_status=$(echo "$org_response" | tr -d '\n' | sed -e 's/.*HTTPSTATUS://')
org_body=$(echo "$org_response" | sed -e 's/HTTPSTATUS\:.*//g')

echo "Organization Status: $org_status"
echo "Organization Response: $org_body"
echo

# Step 5: Test FHIR Patient endpoint
print_header "Step 5: Testing FHIR Patient endpoint..."
patient_response=$(curl -s -w "HTTPSTATUS:%{http_code}" -X GET "$BASE_URL/fhir/Patient" \
    -H "Authorization: Bearer $TOKEN")

patient_status=$(echo "$patient_response" | tr -d '\n' | sed -e 's/.*HTTPSTATUS://')
patient_body=$(echo "$patient_response" | sed -e 's/HTTPSTATUS\:.*//g')

echo "Patient Status: $patient_status"
echo "Patient Response: $patient_body"
echo

# Step 6: Test FHIR Practitioner endpoint
print_header "Step 6: Testing FHIR Practitioner endpoint..."
prac_response=$(curl -s -w "HTTPSTATUS:%{http_code}" -X GET "$BASE_URL/fhir/Practitioner" \
    -H "Authorization: Bearer $TOKEN")

prac_status=$(echo "$prac_response" | tr -d '\n' | sed -e 's/.*HTTPSTATUS://')
prac_body=$(echo "$prac_response" | sed -e 's/HTTPSTATUS\:.*//g')

echo "Practitioner Status: $prac_status"
echo "Practitioner Response: $prac_body"
echo

# Step 7: Test FHIR Appointment endpoint
print_header "Step 7: Testing FHIR Appointment endpoint..."
appt_response=$(curl -s -w "HTTPSTATUS:%{http_code}" -X GET "$BASE_URL/fhir/Appointment" \
    -H "Authorization: Bearer $TOKEN")

appt_status=$(echo "$appt_response" | tr -d '\n' | sed -e 's/.*HTTPSTATUS://')
appt_body=$(echo "$appt_response" | sed -e 's/HTTPSTATUS\:.*//g')

echo "Appointment Status: $appt_status"
echo "Appointment Response: $appt_body"
echo

echo "================================================"
print_status "Debug test completed!"
echo "================================================"

# Summary
echo "Summary:"
echo "- Health: ✓"
echo "- Login: $([ "$http_status" -eq "200" ] && echo "✓" || echo "✗")"
echo "- User Info: $([ "$user_status" -eq "200" ] && echo "✓" || echo "✗")"
echo "- Organizations: $([ "$org_status" -eq "200" ] && echo "✓" || echo "✗")"
echo "- Patients: $([ "$patient_status" -eq "200" ] && echo "✓" || echo "✗")"
echo "- Practitioners: $([ "$prac_status" -eq "200" ] && echo "✓" || echo "✗")"
echo "- Appointments: $([ "$appt_status" -eq "200" ] && echo "✓" || echo "✗")"