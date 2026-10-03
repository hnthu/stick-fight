# CPU trong Stick Fight được viết như thế nào

Phần CPU nằm trong `src/ai.js` (hàm `aiInput` và `wantsSkill`). Luật dùng chiêu của từng nhân vật nằm ở hàm `aiWantsSkill` trong file `characters/<tên>.js`, còn `obstacleAhead` ở `src/arena.js`.

## 1. Ý tưởng chính: CPU "bấm phím ảo"

CPU không có luật chơi riêng. Mỗi khung hình (60 lần/giây), game lấy lệnh điều khiển của hai nhân vật dưới cùng một dạng object:

```js
{ left, right, up, down, punch, kick, skill }   // true / false
```

- Người chơi: `readInput()` đọc bàn phím rồi trả về object này.
- CPU: `aiInput(me, foe, dt)` tự tính ra object này.

```js
i1 = readInput(...);                                      // người chơi
i2 = mode === 'cpu' ? aiInput(p2, p1, gdt) : readInput([MAPS.p2]);
p1.update(gdt, i1, p2);
p2.update(gdt, i2, p1);
```

Nhờ vậy CPU chịu đúng mọi giới hạn như người chơi: hồi chiêu, bị choáng, nhảy tối đa 2 lần, va vào vật cản...

## 2. "Bộ não" và nhịp suy nghĩ

Mỗi CPU có một object `brain` lưu quyết định hiện tại:

```js
{ t, move, block, jump, atk, skill }
```

`t` là đồng hồ đếm ngược. Chỉ khi `t <= 0` CPU mới suy nghĩ lại, rồi đặt `t` ngẫu nhiên trong khoảng 0,09 đến 0,25 giây. Giữa hai lần suy nghĩ nó giữ nguyên hướng đi và đỡ đòn. Đây là "thời gian phản xạ" của CPU.

## 3. Cây quyết định (mỗi lần suy nghĩ)

```js
const dx = foe.x - me.x, adx = Math.abs(dx), dy = foe.y - me.y;
if (me.skillCd <= 0 && wantsSkill(me, foe, adx, dy)) ai.skill = true;   // (a)
else if (threatened && Math.random() < 0.42)        ai.block = true;    // (b)
else if (adx > 64) { ai.move = dir; ...nhảy theo nếu đối thủ ở cao... }  // (c)
else { ...đánh / lùi / nhảy / đỡ theo xác suất... }                     // (d)
```

Các nhánh được xét lần lượt từ trên xuống:

- **(a) Dùng chiêu:** `wantsSkill` gọi `aiWantsSkill` của nhân vật đang được điều khiển. Mỗi nhân vật có điều kiện riêng về khoảng cách và một xác suất. Ví dụ, cầu lửa được dùng khi `adx > 140`, ngang tầm và 50% số lần; Meditate khi máu dưới 65%.
- **(b) Đỡ:** `threatened` đúng khi đối thủ đang ra đòn (đấm, đá, Flurry, cắn) trong phạm vi 110px.
- **(c) Tiếp cận:** khi còn xa hơn 64px thì đi về phía đối thủ. Nếu đối thủ đứng cao hơn 60px, có 40% nhảy lên; ngoài ra có 3% nhảy ngẫu nhiên.
- **(d) Cận chiến:** bốc một số ngẫu nhiên `r` để chọn hành động:
  - `r < 0.62`: tấn công. Đứng sát (dưới 54px) thì 70% đấm, 30% đá; xa hơn thì đá.
  - `r < 0.74`: lùi lại
  - `r < 0.80`: nhảy
  - `r < 0.90`: đỡ
  - còn lại: đứng yên
  - Nếu máu dưới 30% thì có thêm 15% cơ hội lùi lại.

## 4. Các luật "phản xạ" chạy mỗi khung hình

Sau cây quyết định, mỗi khung hình còn một vài luật ghi đè:

- **Né vùng nguy hiểm:** nếu đứng trong một vùng `danger` (hiện tại là dấu sét của Volt, bán kính 60px), có 30% bước ra khỏi đó.
- **Nhảy đôi đuổi theo:** đang trên không mà đối thủ ở cao hơn thì thỉnh thoảng nhảy lần hai.
- **Vật cản:** `obstacleAhead(me, hướng, 60)` tìm khối rắn ngay phía trước.
  - Nếu khối cao hơn 120px và đập vỡ được, CPU đá nó.
  - Còn lại thì nhảy qua. Nếu vẫn chưa qua khi đang trên không, nó nhảy lần hai.
- **Chống kẹt:** nếu muốn đi mà vị trí x không đổi trong 0,35 giây thì CPU nhảy.

## 5. Lệnh một lần và lệnh giữ

`move` và `block` là lệnh **giữ**, có tác dụng như giữ phím cho tới lần suy nghĩ sau. `jump`, `atk` và `skill` là lệnh **bấm một lần**: gửi đi trong một khung hình rồi bị xóa ngay:

```js
const inp = { left: ai.move < 0, right: ai.move > 0, down: ai.block,
              up: ai.jump, punch: ai.atk === 'punch', kick: ai.atk === 'kick', skill: ai.skill };
ai.jump = false; ai.atk = null; ai.skill = false;
return inp;
```

## 6. Giới hạn hiện tại

- Chỉ có một độ khó. Các con số 0.42 (đỡ), 0.62 (đánh), 0.09 đến 0.25 giây (phản xạ) được viết cố định trong code.
- CPU không đọc bẫy của võ đài. Hàm `update` của từng file arena tự gây sát thương, còn CPU không biết vùng nào nguy hiểm.
- CPU không nhớ hay học thói quen của người chơi; mọi quyết định chỉ dựa trên tình huống hiện tại cộng với ngẫu nhiên.
- Màn hình menu dùng cùng hàm này cho cả hai nhân vật (cảnh tự đánh nhau phía sau menu).
