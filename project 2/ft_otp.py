import hmac
import hashlib
import time
import os

# Constants
KEY_FILE = "ft_otp.key"
ENCRYPTION_KEY = 0x5A  # Simple XOR key
HEX_KEY_LENGTH = 64
BIN_KEY_LENGTH = 32  # 64 hex characters -> 32 bytes

# Validate the hex key
def is_valid_hex(hex_key):
    return len(hex_key) == HEX_KEY_LENGTH and all(c in '0123456789abcdefABCDEF' for c in hex_key)

# Convert hex to binary
def hex_to_bin(hex_key):
    return bytes.fromhex(hex_key)

# Encrypt/decrypt with XOR
def xor_encrypt(data, key):
    return bytes([b ^ key for b in data])

# Save key to ft_otp.key after encryption
def generate_key(file_path):
    try:
        with open(file_path, 'r') as f:
            hex_key = f.read().strip()
        
        if not is_valid_hex(hex_key):
            print("Error: key must be 64 hexadecimal characters.")
            return
        
        binary_key = hex_to_bin(hex_key)
        encrypted_key = xor_encrypt(binary_key, ENCRYPTION_KEY)
        
        with open(KEY_FILE, 'wb') as f:
            f.write(encrypted_key)
        
        print("Key was successfully saved in ft_otp.key.")
    except Exception as e:
        print(f"Error: {e}")

# Generate OTP from the key
def generate_otp(file_path):
    try:
        with open(file_path, 'rb') as f:
            encrypted_key = f.read()
        
        decrypted_key = xor_encrypt(encrypted_key, ENCRYPTION_KEY)

        # HOTP: Use the current time to generate a counter (time-based)
        counter = int(time.time() // 60)  # One OTP every minute
        counter_bytes = counter.to_bytes(8, byteorder='big')

        # HMAC-SHA1
        hmac_result = hmac.new(decrypted_key, counter_bytes, hashlib.sha1).digest()

        # Truncate to 6 digits OTP
        offset = hmac_result[19] & 0xf
        otp = (int.from_bytes(hmac_result[offset:offset+4], byteorder='big') & 0x7fffffff) % 1000000

        print(f"{otp:06d}")
    except Exception as e:
        print(f"Error: {e}")

# Main function to parse arguments and call appropriate methods
if __name__ == "__main__":
    import sys
    if len(sys.argv) != 3:
        print(f"Usage: {sys.argv[0]} -g keyfile | -k ft_otp.key")
        sys.exit(1)

    if sys.argv[1] == "-g":
        generate_key(sys.argv[2])
    elif sys.argv[1] == "-k":
        generate_otp(sys.argv[2])
    else:
        print(f"Invalid option: {sys.argv[1]}")
        sys.exit(1)
