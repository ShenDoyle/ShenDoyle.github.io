var posts=["2019/01/07/aboutsem/","2020/01/09/aboutsa/","2021/01/07/hexocommand/","2020/10/02/excel/","2020/06/10/excelabsoluterelative/","2024/01/01/kunmingxishan/","2020/11/27/jsDelivr/","2020/01/10/learnvlookup/","2021/07/26/lose_weight/","2020/01/17/onedrive/","2020/04/16/typechonub/","2021/01/09/semvssa/","2022/11/26/yzncms/","2020/11/18/wzxn/","2019/02/07/flashing/","2023/12/16/newsemer/","2024/01/14/prohibitedwordsdy/","2024/01/14/prohibitedwordssph/","2024/01/13/prohibitedwordsxhs/","2025/08/15/aboutgeo/","2025/08/20/geoaq/"];function toRandomPost(){
    pjax.loadUrl('/'+posts[Math.floor(Math.random() * posts.length)]);
  };var friend_link_list=[{"name":"Hexo","link":"https://hexo.io/zh-tw/","avatar":"https://d33wubrfki0l68.cloudfront.net/6657ba50e702d84afb32fe846bed54fba1a77add/827ae/logo.svg","descr":"快速、简单且强大的网站框架"},{"name":"南城","link":"https://cbm.im/","avatar":"https://cbm.im/img/avatar.webp","descr":"智者乐水，仁者乐山。"},{"name":"南城","link":"https://cbm.im/","avatar":"https://cbm.im/img/avatar.webp","descr":"智者乐水，仁者乐山。","siteshot":"https://gitee.com/cvvik/noet/raw/master/pim/2024215181707994558749time_cbm.im.webp","color":"vip","tag":"运营"},{"name":"南城","link":"https://cbm.im/","avatar":"https://cbm.im/img/avatar.webp","descr":"智者乐水，仁者乐山。","recommend":true}];
    var refreshNum = 1;
    function friendChainRandomTransmission() {
      const randomIndex = Math.floor(Math.random() * friend_link_list.length);
      const { name, link } = friend_link_list.splice(randomIndex, 1)[0];
      Snackbar.show({
        text:
          "点击前往按钮进入随机一个友链，不保证跳转网站的安全性和可用性。本次随机到的是本站友链：「" + name + "」",
        duration: 8000,
        pos: "top-center",
        actionText: "前往",
        onActionClick: function (element) {
          element.style.opacity = 0;
          window.open(link, "_blank");
        },
      });
    }
    function addFriendLinksInFooter() {
      var footerRandomFriendsBtn = document.getElementById("footer-random-friends-btn");
      if(!footerRandomFriendsBtn) return;
      footerRandomFriendsBtn.style.opacity = "0.2";
      footerRandomFriendsBtn.style.transitionDuration = "0.3s";
      footerRandomFriendsBtn.style.transform = "rotate(" + 360 * refreshNum++ + "deg)";
      const finalLinkList = [];
  
      let count = 0;

      while (friend_link_list.length && count < 3) {
        const randomIndex = Math.floor(Math.random() * friend_link_list.length);
        const { name, link, avatar } = friend_link_list.splice(randomIndex, 1)[0];
  
        finalLinkList.push({
          name,
          link,
          avatar,
        });
        count++;
      }
  
      let html = finalLinkList
        .map(({ name, link }) => {
          const returnInfo = "<a class='footer-item' href='" + link + "' target='_blank' rel='noopener nofollow'>" + name + "</a>"
          return returnInfo;
        })
        .join("");
  
      html += "<a class='footer-item' href='/link/'>更多</a>";

      document.getElementById("friend-links-in-footer").innerHTML = html;

      setTimeout(()=>{
        footerRandomFriendsBtn.style.opacity = "1";
      }, 300)
    };