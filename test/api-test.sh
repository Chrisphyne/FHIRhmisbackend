#!/bin/bash

# Healthcare Management API Test Script
# Comprehensive testing of all endpoints with environment variables

set -e

# Configuration from environment variables
BASE_URL="${API_BASE_URL:-http://localhost:3005}"
# EMAIL="${TEST_EMAIL:-admin@hospital.com}"
EMAIL="${TEST_EMAIL:-admin1@hospital.com}"
PASSWORD="${TEST_PASSWORD:-SecurePassword123!}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Variables to store IDs
AUTH_TOKEN=""
ORGANIZATION_ID=""
PATIENT_ID=""
PRACTITIONER_ID=""
APPOINTMENT_ID=""

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_header() {
    echo -e "${BLUE}[TEST]${NC} $1"
}

# Function to make HTTP requests and check status
make_request() {
    local method=$1
    local url=$2
    local data=$3
    local expected_status=$4
    local headers=$5

    print_status "Making $method request to $url"

    if [ -n "$data" ]; then
        if [ -n "$headers" ]; then
            response=$(curl -s -w "HTTPSTATUS:%{http_code}" -X "$method" "$url" \
                -H "Content-Type: application/json" \
                -H "Authorization: Bearer $AUTH_TOKEN" \
                $headers \
                -d "$data")
        else
            response=$(curl -s -w "HTTPSTATUS:%{http_code}" -X "$method" "$url" \
                -H "Content-Type: application/json" \
                -H "Authorization: Bearer $AUTH_TOKEN" \
                -d "$data")
        fi
    else
        if [ -n "$headers" ]; then
            response=$(curl -s -w "HTTPSTATUS:%{http_code}" -X "$method" "$url" \
                -H "Authorization: Bearer $AUTH_TOKEN" \
                $headers)
        else
            response=$(curl -s -w "HTTPSTATUS:%{http_code}" -X "$method" "$url" \
                -H "Authorization: Bearer $AUTH_TOKEN")
        fi
    fi

    # Extract HTTP status code
    http_status=$(echo "$response" | tr -d '\n' | sed -e 's/.*HTTPSTATUS://')

    # Extract response body
    response_body=$(echo "$response" | sed -e 's/HTTPSTATUS\:.*//g')

    if [ "$http_status" -eq "$expected_status" ]; then
        print_status "✓ Request successful (Status: $http_status)"
        echo "$response_body"
    else
        print_error "✗ Request failed (Expected: $expected_status, Got: $http_status)"
        echo "Response: $response_body"
        echo "URL: $url"
        echo "Method: $method"
        echo "Data: $data"
        exit 1
    fi
}

# Function to make requests without auth token (for public endpoints)
make_public_request() {
    local method=$1
    local url=$2
    local data=$3
    local expected_status=$4

    print_status "Making $method request to $url (public)"

    if [ -n "$data" ]; then
        response=$(curl -s -w "HTTPSTATUS:%{http_code}" -X "$method" "$url" \
            -H "Content-Type: application/json" \
            -d "$data")
    else
        response=$(curl -s -w "HTTPSTATUS:%{http_code}" -X "$method" "$url")
    fi

    # Extract HTTP status code
    http_status=$(echo "$response" | tr -d '\n' | sed -e 's/.*HTTPSTATUS://')

    # Extract response body
    response_body=$(echo "$response" | sed -e 's/HTTPSTATUS\:.*//g')

    if [ "$http_status" -eq "$expected_status" ]; then
        print_status "✓ Request successful (Status: $http_status)"
        echo "$response_body"
    else
        print_error "✗ Request failed (Expected: $expected_status, Got: $http_status)"
        echo "Response: $response_body"
        echo "URL: $url"
        echo "Method: $method"
        echo "Data: $data"
        exit 1
    fi
}

# Function to extract ID from JSON response
extract_id() {
    echo "$1" | grep -o '"id":"[^"]*"' | sed 's/"id":"//g' | sed 's/"//g'
}

# Function to extract token from login response
extract_token() {
    echo "$1" | grep -o '"token":"[^"]*"' | sed 's/"token":"//g' | sed 's/"//g'
}

echo "================================================"
echo "Healthcare Management API Test Suite"
echo "Base URL: $BASE_URL"
echo "Test Email: $EMAIL"
echo "================================================"

# Test 1: Health Check
print_header "Testing health check endpoint..."
health_response=$(make_public_request "GET" "$BASE_URL/health" "" 200)
print_status "Health check passed ✓"
echo

# Test 2: Metrics Check
print_header "Testing metrics endpoint..."
metrics_response=$(make_public_request "GET" "$BASE_URL/metrics" "" 200)
print_status "Metrics check passed ✓"
echo

# Test 3: User Registration
print_header "Testing user registration..."
register_data='{
    "email": "'$EMAIL'",
    "password": "'$PASSWORD'",
    "role": "super_admin"
}'
register_response=$(make_public_request "POST" "$BASE_URL/api/auth/register" "$register_data" 201)
print_status "User registration passed ✓"
echo

# Test 4: User Login
print_header "Testing user login..."
login_data='{
    "email": "'$EMAIL'",
    "password": "'$PASSWORD'"
}'
login_response=$(make_public_request "POST" "$BASE_URL/api/auth/login" "$login_data" 200)
AUTH_TOKEN=$(extract_token "$login_response")
print_status "User login passed ✓ (Token: ${AUTH_TOKEN:0:20}...)"
echo

# Test 5: Get Current User Info
print_header "Testing get current user info..."
user_info_response=$(make_request "GET" "$BASE_URL/api/auth/me" "" 200)
print_status "Get current user info passed ✓"
echo

# Test 6: Create Organization
print_header "Testing organization creation..."
org_data='{
    "resourceType": "Organization",
    "name": "General Hospital",
    "type": [{"text": "hospital"}],
    "active": true,
    "telecom": [
        {
            "system": "phone",
            "value": "+1-555-123-4567",
            "use": "work"
        }
    ],
    "address": [
        {
            "use": "work",
            "line": ["123 Hospital Drive"],
            "city": "Medical City",
            "state": "CA",
            "postalCode": "90210",
            "country": "USA"
        }
    ]
}'
org_response=$(make_request "POST" "$BASE_URL/fhir/Organization" "$org_data" 201)
ORGANIZATION_ID=$(extract_id "$org_response")
print_status "Organization creation passed ✓ (ID: $ORGANIZATION_ID)"
echo

# Test 7: Get Organizations
print_header "Testing get organizations..."
orgs_response=$(make_request "GET" "$BASE_URL/fhir/Organization" "" 200)
print_status "Get organizations passed ✓"
echo

# Test 8: Get User Organizations
print_header "Testing get user organizations..."
user_orgs_response=$(make_request "GET" "$BASE_URL/api/user/organizations" "" 200)
print_status "Get user organizations passed ✓"
echo

# Test 9: Create Patient
print_header "Testing patient creation..."
patient_data='{
    "resourceType": "Patient",
    "active": true,
    "name": [
        {
            "use": "official",
            "family": "Smith",
            "given": ["John", "William"]
        }
    ],
    "telecom": [
        {
            "system": "phone",
            "value": "+1-555-987-6543",
            "use": "home"
        }
    ],
    "gender": "male",
    "birthDate": "1985-03-15",
    "address": [
        {
            "use": "home",
            "line": ["456 Patient Street"],
            "city": "Patient City",
            "state": "CA",
            "postalCode": "90211",
            "country": "USA"
        }
    ]
}'
patient_response=$(make_request "POST" "$BASE_URL/fhir/Patient" "$patient_data" 201 "-H \"x-organization-id: $ORGANIZATION_ID\"")
PATIENT_ID=$(extract_id "$patient_response")
print_status "Patient creation passed ✓ (ID: $PATIENT_ID)"
echo

# Test 10: Get Patients
print_header "Testing get patients..."
patients_response=$(make_request "GET" "$BASE_URL/fhir/Patient" "" 200 "-H \"x-organization-id: $ORGANIZATION_ID\"")
print_status "Get patients passed ✓"
echo

# Test 11: Create Practitioner
print_header "Testing practitioner creation..."
practitioner_data='{
    "resourceType": "Practitioner",
    "active": true,
    "identifier": [
        {
            "use": "official",
            "system": "http://hl7.org/fhir/sid/us-npi",
            "value": "1234567890"
        }
    ],
    "name": [
        {
            "use": "official",
            "family": "Johnson",
            "given": ["Dr. Sarah"],
            "prefix": ["Dr."]
        }
    ],
    "telecom": [
        {
            "system": "email",
            "value": "dr.johnson@hospital.com",
            "use": "work"
        }
    ],
    "gender": "female",
    "birthDate": "1975-08-22"
}'
practitioner_response=$(make_request "POST" "$BASE_URL/fhir/Practitioner" "$practitioner_data" 201 "-H \"x-organization-id: $ORGANIZATION_ID\"")
PRACTITIONER_ID=$(extract_id "$practitioner_response")
print_status "Practitioner creation passed ✓ (ID: $PRACTITIONER_ID)"
echo

# Test 12: Get Practitioners
print_header "Testing get practitioners..."
practitioners_response=$(make_request "GET" "$BASE_URL/fhir/Practitioner" "" 200 "-H \"x-organization-id: $ORGANIZATION_ID\"")
print_status "Get practitioners passed ✓"
echo

# Test 13: Create Appointment
print_header "Testing appointment creation..."
appointment_data='{
    "resourceType": "Appointment",
    "status": "booked",
    "serviceType": [
        {
            "coding": [
                {
                    "system": "http://terminology.hl7.org/CodeSystem/service-type",
                    "code": "124",
                    "display": "General Practice"
                }
            ]
        }
    ],
    "description": "Annual physical examination",
    "start": "2024-01-15T09:00:00Z",
    "end": "2024-01-15T09:30:00Z",
    "minutesDuration": 30,
    "comment": "Patient requesting annual checkup",
    "patientId": "'$PATIENT_ID'",
    "practitionerId": "'$PRACTITIONER_ID'"
}'
appointment_response=$(make_request "POST" "$BASE_URL/fhir/Appointment" "$appointment_data" 201 "-H \"x-organization-id: $ORGANIZATION_ID\"")
APPOINTMENT_ID=$(extract_id "$appointment_response")
print_status "Appointment creation passed ✓ (ID: $APPOINTMENT_ID)"
echo

# Test 14: Get Appointments
print_header "Testing get appointments..."
appointments_response=$(make_request "GET" "$BASE_URL/fhir/Appointment" "" 200 "-H \"x-organization-id: $ORGANIZATION_ID\"")
print_status "Get appointments passed ✓"
echo

# Test 15: Update Patient
print_header "Testing patient update..."
patient_update_data='{
    "resourceType": "Patient",
    "active": true,
    "name": [
        {
            "use": "official",
            "family": "Smith",
            "given": ["John", "William", "Updated"]
        }
    ],
    "gender": "male",
    "birthDate": "1985-03-15"
}'
patient_update_response=$(make_request "PUT" "$BASE_URL/fhir/Patient/$PATIENT_ID" "$patient_update_data" 200 "-H \"x-organization-id: $ORGANIZATION_ID\"")
print_status "Patient update passed ✓"
echo

# Test 16: Update Appointment
print_header "Testing appointment update..."
appointment_update_data='{
    "resourceType": "Appointment",
    "status": "fulfilled",
    "description": "Annual physical examination - completed",
    "comment": "Patient completed annual checkup, all vitals normal"
}'
appointment_update_response=$(make_request "PUT" "$BASE_URL/fhir/Appointment/$APPOINTMENT_ID" "$appointment_update_data" 200 "-H \"x-organization-id: $ORGANIZATION_ID\"")
print_status "Appointment update passed ✓"
echo

# Test 17: Search Appointments by Patient
print_header "Testing appointment search by patient..."
search_response=$(make_request "GET" "$BASE_URL/fhir/Appointment?patient=$PATIENT_ID" "" 200 "-H \"x-organization-id: $ORGANIZATION_ID\"")
print_status "Appointment search by patient passed ✓"
echo

# Test 18: Assign Patient to Organization
print_header "Testing patient assignment to organization..."
assign_patient_data='{
    "organizationId": "'$ORGANIZATION_ID'",
    "relationship": "specialist"
}'
assign_response=$(make_request "POST" "$BASE_URL/fhir/Patient/$PATIENT_ID/assign-organization" "$assign_patient_data" 201)
print_status "Patient assignment passed ✓"
echo

# Test 19: Assign Practitioner to Organization
print_header "Testing practitioner assignment to organization..."
assign_practitioner_data='{
    "organizationId": "'$ORGANIZATION_ID'",
    "role": "consulting",
    "permissions": {
        "canPrescribe": true,
        "canOrder": true
    }
}'
assign_prac_response=$(make_request "POST" "$BASE_URL/fhir/Practitioner/$PRACTITIONER_ID/assign-organization" "$assign_practitioner_data" 201)
print_status "Practitioner assignment passed ✓"
echo

# Test 20: Switch Organization
print_header "Testing organization switching..."
switch_org_data='{
    "organizationId": "'$ORGANIZATION_ID'"
}'
switch_response=$(make_request "POST" "$BASE_URL/api/user/switch-organization" "$switch_org_data" 200)
print_status "Organization switching passed ✓"
echo

# Test 21: Token Refresh
print_header "Testing token refresh..."
refresh_response=$(make_request "POST" "$BASE_URL/api/auth/refresh" "" 200)
print_status "Token refresh passed ✓"
echo

# Test 22: Logout
print_header "Testing user logout..."
logout_response=$(make_request "POST" "$BASE_URL/api/auth/logout" "" 200)
print_status "User logout passed ✓"
echo

# Test 23: Cancel Appointment
print_header "Testing appointment cancellation..."
cancel_response=$(make_request "DELETE" "$BASE_URL/fhir/Appointment/$APPOINTMENT_ID" "" 204 "-H \"x-organization-id: $ORGANIZATION_ID\"")
print_status "Appointment cancellation passed ✓"
echo

echo "================================================"
print_status "All tests passed successfully! ✅"
echo "================================================"

# Summary
echo "Test Summary:"
echo "- Health & Metrics Check: ✓"
echo "- User Registration & Login: ✓"
echo "- User Info & Logout: ✓"
echo "- Organization Management: ✓"
echo "- Patient Management: ✓"
echo "- Practitioner Management: ✓"
echo "- Appointment Management: ✓"
echo "- Organization Assignments: ✓"
echo "- Organization Switching: ✓"
echo "- Token Refresh: ✓"
echo ""
print_status "Created Resources:"
echo "- Organization ID: $ORGANIZATION_ID"
echo "- Patient ID: $PATIENT_ID"
echo "- Practitioner ID: $PRACTITIONER_ID"
echo "- Appointment ID: $APPOINTMENT_ID (cancelled)"
echo ""
print_status "API Base URL: $BASE_URL"
print_status "Documentation: $BASE_URL/docs"
print_status "Health Check: $BASE_URL/health"
