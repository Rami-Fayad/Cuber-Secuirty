import argparse
import os
import time
import hmac
import hashlib
import base64

KEY_FILE = 'ft_otp.key'
INTERVAL = 30  # 30 seconds

def is_valid_hex(hex_string):
    try:
        bytes.fromhex(hex_string)
        return len(hex_string) == 64
    except ValueError:
        return False

def save_key(hex_key):
    binary_key = bytes.fromhex(hex_key)
    encoded_key = base64.b64encode(binary_key).decode()
    with open(KEY_FILE, 'w') as f:
        f.write(encoded_key)
    print("Key was successfully saved in ft_otp.key.")

def load_key(filename):
    try:
        with open(filename, 'r') as f:
            encoded_key = f.read().strip()
            return base64.b64decode(encoded_key)
    except Exception as e:
        print(f"Error loading key: {e}")
        exit(1)

def hotp(key, counter):
    counter_bytes = counter.to_bytes(8, 'big')
    hmac_hash = hmac.new(key, counter_bytes, hashlib.sha1).digest()
    offset = hmac_hash[-1] & 0x0F
    code = ((hmac_hash[offset] & 0x7F) << 24 |
            (hmac_hash[offset + 1] & 0xFF) << 16 |
            (hmac_hash[offset + 2] & 0xFF) << 8 |
            (hmac_hash[offset + 3] & 0xFF))
    return str(code % 1000000).zfill(6)

def generate_otp(filename):
    key = load_key(filename)
    counter = int(time.time()) // INTERVAL
    otp = hotp(key, counter)
    print(otp)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('-g', metavar='key_file', help='Generate and store key')
    parser.add_argument('-k', metavar='stored_key', help='Generate OTP')
    args = parser.parse_args()

    if args.g:
        if not os.path.exists(args.g):
            print("error: key file not found.")
            return
        with open(args.g, 'r') as f:
            key = f.read().strip()
            if not is_valid_hex(key):
                print("error: key must be 64 hexadecimal characters.")
                return
            save_key(key)
    elif args.k:
        generate_otp(args.k)
    else:
        parser.print_help()

if __name__ == "__main__":
    main()

