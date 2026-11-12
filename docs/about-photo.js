(() => {
 const photo=window.PORTFOLIO_ABOUT_PHOTO,image=document.getElementById('about-photo');
 if(!image||!photo?.photo)return;
 image.src=location.protocol==='file:'?(photo.photoData||photo.photo):photo.photo;
 image.hidden=false;image.closest('.about-photo-frame').classList.add('has-photo');
})();
