# קניות לבית

PWA פשוט בעברית לניהול קניות לבית:

- מסמנים מה חסר.
- רואים רשימת "לקנות עכשיו".
- מוסיפים מוצרים חדשים.
- מדביקים קבלה כדי שהסוכן ילמד מה קניתם לפעם הבאה.
- מסונכרן בזמן אמת בין המכשירים דרך Firebase Realtime Database.
- מתקינים באייפון דרך Safari -> Share -> Add to Home Screen.

## פיתוח מקומי

```bash
python3 dev-server.py
```

ואז לפתוח:

```text
http://127.0.0.1:4178/
```

## פריסה

הריפו כולל GitHub Actions לפריסה ל-GitHub Pages. אחרי push ל-`main`, הלינק הציבורי יהיה בדרך כלל:

```text
https://ysalvi-commits.github.io/Home/
```

עותק נפרד לעפרי ורום:

```text
https://ysalvi-commits.github.io/Home/ofri-rom/
```

## Firebase

האפליקציה משתמשת ב-Firebase Authentication במצב Anonymous וב-Realtime Database.

חוקי הדאטהבייס נמצאים בקובץ:

```text
firebase-realtime-database.rules.json
```

מבנה הנתונים:

```text
households/yarden-neta/items
households/ofri-rom/items
```
