# Security & Privacy — SoundWalk / DerivaSonora

## Data model — everything stays on the device

SoundWalk has **no backend server, no account system, no analytics, and no
ads**. All recordings, GPS tracks, and metadata are stored locally (app-private
Capacitor filesystem + browser `localStorage`). Nothing is transmitted to the
developer. The only outbound network traffic is map-tile requests to
OpenStreetMap and other public tile providers (standard HTTPS; reveals device IP
+ viewed area, as any web map does). ZIP export is user-initiated sharing, never
automatic. See [PRIVACY.md](PRIVACY.md) for the full policy.

- `usesCleartextTraffic="false"` and `allowBackup="false"` in the manifest.
- No background-location permission is requested.
- Legacy storage permissions are scoped with `maxSdkVersion` (write ≤29, read ≤32).

## 🔐 Collector-mode password (optional)

The optional "collector" entry mode is gated by a password supplied at build
time via the `VITE_COLLECTOR_PASSWORD` environment variable. It is **not**
required for the public SoundWalk app.

- **No hardcoded password** — the historical hardcoded value was removed;
  `src/config/auth.js` reads only from the environment.
- **Empty password is rejected** — when `VITE_COLLECTOR_PASSWORD` is unset, the
  collector option is hidden entirely and an empty input never validates
  (previously it did).

### Setup (only if you use collector mode)

```bash
# Set the password at build time
VITE_COLLECTOR_PASSWORD=your-secure-password npm run build
```

### Security Best Practices

#### 1. Password Requirements
- Use strong, unique passwords
- Minimum 8 characters
- Include uppercase, lowercase, numbers, and symbols
- Avoid common words or patterns

#### 2. Environment Variables (Production)
```bash
# Set secure environment variable
export VITE_COLLECTOR_PASSWORD="your-very-secure-password"

# Build with environment variable
npm run build
```

#### 3. Regular Password Updates
- Change the collector password regularly
- Use different passwords for development and production
- Monitor access logs for suspicious activity

### Deployment Security

#### For Ubuntu Server Deployment
```bash
# Set environment variable on server
export VITE_COLLECTOR_PASSWORD="production-secure-password"

# Build with secure password
npm run build

# Deploy using rsync script
./deploy-rsync.sh <SERVER_IP> <USERNAME> /var/www/biomap
```

#### For Vercel Deployment
1. Go to Vercel dashboard
2. Navigate to your project settings
3. Add environment variable: `VITE_COLLECTOR_PASSWORD`
4. Set the value to your secure password
5. Redeploy the application

### File Structure
```
src/
├── config/
│   ├── auth.js              # 🔒 SECURE - Contains actual password (gitignored)
│   └── auth.example.js      # 📝 EXAMPLE - Template for setup
├── components/
│   ├── LandingPage.jsx      # ✅ UPDATED - Uses secure validation
│   └── LandingPage_backup.jsx # ✅ UPDATED - Uses secure validation
└── ...
```

### Important Notes

#### ⚠️ Critical Security Points
1. **Never commit `src/config/auth.js`** - It's in `.gitignore`
2. **Use strong passwords** - Avoid default or weak passwords
3. **Environment variables for production** - Don't rely on default values
4. **Regular updates** - Change passwords periodically

#### 🔍 Verification Steps
1. Check that `src/config/auth.js` is not tracked by git:
   ```bash
   git status src/config/auth.js
   # Should show "untracked" or not appear at all
   ```

2. Verify `.gitignore` contains the auth file:
   ```bash
   grep "auth.js" .gitignore
   # Should show: src/config/auth.js
   ```

3. Test the application with the new password

### Troubleshooting

#### Common Issues
1. **Password not working**: Check `src/config/auth.js` exists and has correct password
2. **Build errors**: Ensure `src/config/auth.js` is properly formatted
3. **Environment variable not working**: Verify `VITE_` prefix is used

#### Recovery Steps
If you lose access to the collector mode:
1. Check `src/config/auth.js` for the current password
2. If file is missing, run `./setup-auth.sh` to recreate it
3. For production, check environment variables on your deployment platform

### Additional Security Recommendations

#### 1. HTTPS Only
- Always use HTTPS in production
- Configure SSL certificates properly
- Redirect HTTP to HTTPS

#### 2. Rate Limiting
- Implement rate limiting for password attempts
- Consider adding CAPTCHA for multiple failed attempts

#### 3. Session Management
- Implement session timeouts
- Clear sensitive data on logout
- Use secure session storage

#### 4. Monitoring
- Log authentication attempts
- Monitor for suspicious activity
- Regular security audits

---

**Remember**: Security is an ongoing process. Regularly review and update your security measures! 