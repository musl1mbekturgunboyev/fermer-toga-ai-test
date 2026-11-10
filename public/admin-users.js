async function loadAdminUsers(page=0){
  const target=document.getElementById('admin-users');if(!target)return;
  target.textContent='Yuklanmoqda…';
  try{
    const data=await api('/api/admin-users',{page});if(!target.isConnected)return;
    target.innerHTML=`<p class="muted">${data.page+1}-sahifa · Har sahifada 25 tagacha foydalanuvchi</p>${tbl(['Ism','ID','Telefon','Viloyat','Rol','Sana'],data.users.map(x=>[esc(x.full_name||'—'),esc(x.id),esc(x.phone||'—'),esc(x.region||'—'),esc(x.role||'user'),esc((x.created_at||'').slice(0,10))]))}<div style="display:flex;gap:10px;margin-top:16px"><button type="button" class="btn alt" data-users-page="${data.page-1}" ${data.page===0?'disabled':''}>Oldingi</button><button type="button" class="btn alt" data-users-page="${data.page+1}" ${data.hasMore?'':'disabled'}>Keyingi</button></div>`;
  }catch(e){if(target.isConnected)target.innerHTML='<p role="alert">Foydalanuvchilarni yuklab bo‘lmadi.</p><button class="btn alt" data-users-page="'+page+'">Qayta urinish</button>';}
}
document.addEventListener('click',e=>{const b=e.target.closest('[data-users-page]');if(b&&!b.disabled)loadAdminUsers(Number(b.dataset.usersPage));});
