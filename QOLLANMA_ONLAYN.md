# Calibri ERP: Onlayn Qilish Qo'llanmasi 🚀

Dasturingizni dunyoning istalgan nuqtasidan silka orqali ishlatish va do'stingiz bilan ulashish uchun 2 ta asosiy amalni bajarish kerak.

## 1-Qadam: MongoDB Atlas (Bulutli Ma'lumotlar Bazasi) Sozlash

Kompyuteringizga MongoDB o'rnatish shart emas, biz bepul "Bulutli" bazadan foydalanamiz.

1.  **Ro'yxatdan o'ting**: [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas/register) saytiga kiring.
2.  **Cluster yarating**: "Shared" (Free/Bepul) variantini tanlang va "Create"ni bosing.
3.  **Xavfsizlik (Network Access)**: 
    - Chap menyuda **Network Access** bo'limiga kiring.
    - **Add IP Address** tugmasini bosing va **Allow Access from Anywhere** (yoki `0.0.0.0/0`) yozib saqlang. (Bu hamma joydan ulanishga ruxsat beradi).
4.  **Foydalanuvchi (Database Access)**:
    - **Database Access** bo'limiga kiring.
    - **Add New Database User** bosing.
    - Login (masalan: `admin`) va Parol (masalan: `parol123`) yarating. Buni eslab qoling!
5.  **Ulanish Silkasi (Connection String)**:
    - **Database** bo'limiga qayting va **Connect** tugmasini bosing.
    - **Drivers** variantini tanlang.
    - Sizga shunga o'xshash silka beriladi: `mongodb+srv://admin:<password>@cluster0...mongodb.net/?retryWrites=true&w=majority`
    - Shu silkani nusxalab oling va menga yuboring (yoki `.env` fayliga qo'ying).

---

## 2-Qadam: Render.com (Dasturni Onlayn Qilish)

Dasturingizni doimiy ishlatish uchun uni onlayn xostingga qo'yamiz.

1.  **Render.com** saytida **GitHub** orqali ro'yxatdan o'ting. (Sizga GitHub orqali ro'yxatdan o'tishni tavsiya qilaman, chunki Render dasturingizni to'g'ridan-to'g'ri GitHub'dan oladi).
2.  **New +** tugmasini bosing va **Web Service**ni tanlang.
3.  Loyihangizni (GitHub orqali) ulang.
4.  **Settings** bo'limida `MONGODB_URI` o'zgaruvchisiga boyagi Atlas silkasini qo'shing.
5.  Render sizga `https://calibri-erp.onrender.com` kabi tayyor silka beradi.

---

### Nima qilish kerak?
Hozircha faqat **1-qadamni** bajaring va menga MongoDB silkasini yuboring. Qolgan barcha kod o'zgarishlarini (Renderga tayyorlashni) men o'zim bajaraman.

Savollar bo'lsa, so'rang!
