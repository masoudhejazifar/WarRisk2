#!/usr/bin/env python3
"""بعد از «npx cap add android» اجرا می‌شود: کد اندروید، منابع و مجوزها را به پروژه اضافه می‌کند."""
import os, re, shutil, sys

root = os.path.dirname(os.path.abspath(__file__))
android = os.path.join(root, '..', 'android')
pkg_dir = os.path.join(android, 'app', 'src', 'main', 'java', 'ir', 'masoud', 'riskwatch')
res_dir = os.path.join(android, 'app', 'src', 'main', 'res')
manifest = os.path.join(android, 'app', 'src', 'main', 'AndroidManifest.xml')

os.makedirs(pkg_dir, exist_ok=True)
for f in os.listdir(os.path.join(root, 'java')):
    shutil.copy(os.path.join(root, 'java', f), os.path.join(pkg_dir, f))      # MainActivity.java هم جایگزین می‌شود
for sub in ('raw', 'xml', 'layout'):
    os.makedirs(os.path.join(res_dir, sub), exist_ok=True)
    for f in os.listdir(os.path.join(root, 'res', sub)):
        shutil.copy(os.path.join(root, 'res', sub, f), os.path.join(res_dir, sub, f))

m = open(manifest, encoding='utf-8').read()
perms = ['POST_NOTIFICATIONS', 'FOREGROUND_SERVICE', 'FOREGROUND_SERVICE_SPECIAL_USE', 'WAKE_LOCK', 'RECEIVE_BOOT_COMPLETED',
         'VIBRATE', 'USE_FULL_SCREEN_INTENT', 'REQUEST_IGNORE_BATTERY_OPTIMIZATIONS', 'ACCESS_NETWORK_STATE', 'INTERNET']
add = ''
for p in perms:
    line = '<uses-permission android:name="android.permission.%s" />' % p
    if line not in m and ('android.permission.%s"' % p) not in m:
        add += '    ' + line + '\n'
if add:
    m = m.replace('<application', add + '    <application', 1)

components = '''
        <service android:name=".MonitorService" android:exported="false" android:foregroundServiceType="specialUse">
            <property android:name="android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE" android:value="safety_monitoring" />
        </service>
        <receiver android:name=".BootReceiver" android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.BOOT_COMPLETED" />
                <action android:name="android.intent.action.MY_PACKAGE_REPLACED" />
            </intent-filter>
        </receiver>
        <receiver android:name=".RiskWidgetProvider" android:exported="true" android:label="پایش خطر">
            <intent-filter>
                <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />
            </intent-filter>
            <meta-data android:name="android.appwidget.provider" android:resource="@xml/risk_widget_info" />
        </receiver>
        <activity android:name=".AlarmActivity" android:exported="false" android:showWhenLocked="true" android:turnScreenOn="true"
            android:launchMode="singleTask" android:excludeFromRecents="true" android:theme="@android:style/Theme.DeviceDefault.NoActionBar" />
'''
if 'MonitorService' not in m:
    m = m.replace('</application>', components + '    </application>', 1)
open(manifest, 'w', encoding='utf-8').write(m)
print('native files applied; manifest patched')
