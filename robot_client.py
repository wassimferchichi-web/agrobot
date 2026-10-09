import time
import requests

PHONE_IP      = 'http://10.22.176.51:8080'
API_URL       = 'http://localhost:8000'
CAPTURE_EVERY = 3
STREAM_URL    = PHONE_IP + '/shot.jpg'

print('Robot Client started')
print('Press Ctrl+C to stop')

while True:
    try:
        snap = requests.get(STREAM_URL, timeout=5)
        if snap.status_code != 200:
            print('Cannot reach phone - is IP Webcam running?')
            time.sleep(2)
            continue
        response = requests.post(
            API_URL + '/robot/frame',
            files={'file': ('frame.jpg', snap.content, 'image/jpeg')},
            timeout=10,
        )
        if response.status_code == 200:
            data = response.json()
            status = 'Healthy' if data['is_healthy'] else 'DISEASE DETECTED'
            print(status + ' | ' + data['plant'] + ' - ' + data['condition'] + ' | ' + str(data['confidence']) + '%')
        else:
            print('API error ' + str(response.status_code))
    except Exception as e:
        print('Error: ' + str(e))
    time.sleep(CAPTURE_EVERY)
