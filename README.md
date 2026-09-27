# Milano Store

الواجهة العامة للمتجر الإلكتروني، جاهزة للربط مع Netlify.

## التشغيل المحلي

```bash
npm install --legacy-peer-deps
npm run dev
```

## النشر على Netlify

- **Base directory:** اتركه فارغاً عند استخدام هذا المستودع.
- **Build command:** `npm run build`
- **Publish directory:** `dist`

إعداد Firebase موجود في `src/lib/firebase.js`. إعداد Cloudinary الاختياري موجود في `.env.example`.

لوحة الإدارة ليست ضمن رابط العملاء؛ لها مستودع مستقل باسم `milano-admin`.
