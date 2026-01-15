
import json
import re

def test_parsing(raw_content):
    print(f"--- Testing content: {repr(raw_content)} ---")

    # Existing logic
    clean_content = raw_content
    if "```" in clean_content:
            clean_content = clean_content.replace("```json", "").replace("```", "").strip()

    print(f"Cleaned (current logic): {repr(clean_content)}")
    try:
        data = json.loads(clean_content)
        print("Success (current logic)!")
    except json.JSONDecodeError as e:
        print(f"Failed (current logic): {e}")

    # Proposed logic: Regex extraction
    print("--- Proposed Logic ---")
    try:
        # Find the first '{' and the last '}'
        match = re.search(r'\{.*\}', raw_content, re.DOTALL)
        if match:
            json_str = match.group(0)
            data = json.loads(json_str)
            print(f"Success (regex)! Extracted: {json_str[:50]}...")
        else:
             print("Failed (regex): No JSON object found.")
    except Exception as e:
        print(f"Failed (regex): {e}")
    print("\n")

# Test cases
test_parsing('{"updates": {}, "response": "Hello"}') # Valid
test_parsing('```json\n{"updates": {}, "response": "Hello"}\n```') # Valid wrapped
test_parsing('Here is the JSON:\n```json\n{"updates": {}, "response": "Hello"}\n```') # Mixed content
test_parsing('') # Empty
test_parsing('   ') # Whitespace
test_parsing('I am not JSON.') # Plain text
