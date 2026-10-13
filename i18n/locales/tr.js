// i18n/locales/tr.js — Türkçe (İstanbul Türkçesi)
module.exports = {
  // ==================== Dil ====================
  'lang.choose': 'Lütfen tercih ettiğiniz dili seçin.',
  'flow.language_changed': 'Diliniz güncellendi.',

  // ==================== Koşullar ====================
  'rules.intro': 'Kaydolmadan önce lütfen Vochino⁰¹ Kullanım Koşulları\'nı dikkatlice okuyun. Devam etmek için koşulları kabul etmeniz gerekir.',
  'rules.accept': 'Kabul et ve devam et',
  'rules.decline': 'Reddet',
  'rules.change_language': '🌐 Dili değiştir',
  'rules.page_label': '📄 Bölüm {current} / {total}',
  'rules.declined': 'Kayıt işlemine devam etmek ve kimlik doğrulaması gerektiren hizmetleri kullanmak için Kullanım Koşulları\'nı kabul etmeniz gerekir. Hazır olduğunuzda koşulları yeniden okuyup kabul edebilirsiniz.',
  'rules.show_again': 'Koşulları yeniden oku',
  'rules.unavailable': 'Kullanım Koşulları bu dil için henüz sistemde tanımlanmadığından kayıt işlemine şu an devam edilemiyor. Lütfen başka bir dil seçin veya daha sonra tekrar deneyin; sorun devam ederse destek ekibiyle iletişime geçin.',

  // ==================== Telefon ====================
  'phone.request': 'Kaydı tamamlamak için telefon numaranızı aşağıdaki Telegram düğmesini kullanarak paylaşın. Numara kendi hesabınıza ait olmalıdır.',
  'phone.button': 'Telefon numarasını paylaş',
  'phone.invalid_owner': 'Gönderdiğiniz numara kendi Telegram hesabınıza ait değil. Lütfen yalnızca "Telefon numarasını paylaş" düğmesiyle kendi numaranızı gönderin.',
  'phone.use_button': 'Telefon numaranızı paylaşmak için lütfen ekranın altındaki "Telefon numarasını paylaş" düğmesini kullanın.',

  // ==================== Ad soyad ====================
  'name.request': 'Lütfen kişisel bilgilerinizde yer alan gerçek adınızı ve soyadınızı girin. Bu ad, hesap bilgilerinizin kaydı için kullanılır.',
  'name.invalid': 'Hesap bilgilerinizi doğru kaydedebilmemiz için lütfen adınızı ve soyadınızı eksiksiz girin.',

  // ==================== Kimlik numarası ====================
  'nid.request': '10 haneli İran ulusal kimlik numaranızı girin. Lütfen rakamları dikkatlice kontrol edin; bu bilgi hesap bilgilerinizin kaydı için kullanılır.',
  'nid.error_length': 'Ulusal kimlik numarası tam olarak 10 haneli olmalıdır. Lütfen kontrol edip tekrar girin.',
  'nid.error_check': 'Girdiğiniz ulusal kimlik numarası geçerli değil (kontrol hanesi uyuşmuyor). Lütfen bilgileri kontrol edip tekrar gönderin.',

  // ==================== Banka kartı ====================
  'card.request': 'Banka kartı, kayıt sırasında belirttiğiniz ad ve soyadla aynı kişinin adına kayıtlı olmalıdır. Lütfen kendi kartınızı girin. Sahiplik uyuşmazsa hesap doğrulanamaz.\n\n16 haneli kart numaranızı girin. Kart şifresi, CVV2 ve dinamik şifre istenmez; lütfen bunları asla göndermeyin.',
  'card.error_length': 'Kart numarası tam olarak 16 haneli olmalıdır. Lütfen kontrol edip tekrar girin.',
  'card.error_check': 'Girdiğiniz kart numarası geçerli görünmüyor. Lütfen kontrol edip tekrar gönderin.',

  // ==================== Kontrol ====================
  'review.step1': '⏳ Gönderdiğiniz bilgiler kontrol ediliyor…',
  'review.step2': '⏳ Bilgilerin eksiksiz olup olmadığı kontrol ediliyor ve hesap durumu kaydediliyor…',
  'review.step3': '⏳ Kayıt işlemi tamamlanıyor…',
  'review.running': 'Kaydınız tamamlanıyor. Lütfen birkaç saniye bekleyin.',

  // ==================== Sonuç ====================
  'result.silver': 'Tebrikler; Gümüş kimlik doğrulamanız onaylandı.\n\nHesap bilgileriniz:\n\nAd soyad: {full_name}\nTelefon numarası: {phone}\nBanka kartı: {masked_card}\n\nGünlük toplam alım ve satım limiti: {limit} Toman\n\nBilgileriniz kaydedildi. Ana menüden istediğiniz hizmeti seçebilirsiniz.',
  'result.data_problem': 'Gönderilen bilgilerin bir kısmı eksik veya geçersiz. Yanlış kayıt oluşmaması için lütfen bilgileri yeniden girin.',
  'result.error': 'Kaydınız tamamlanırken geçici bir hata oluştu. Bilgileriniz saklandı; bu adımdan devam etmek için lütfen tekrar /start gönderin.',

  // ==================== Ana menü ====================
  'menu.title': '⫹⫺ Vochino⁰¹ Borsası',
  'menu.header': '⎙ Voucher işlemleri için uzman merkez\n⏧  Hız ve likiditeye odaklı\n⎚ Hassas icra ve düzenli sipariş takibi\n☏ Çevrimiçi desteğe doğrudan erişim\n☟İlerlemek istediğiniz yolu seçin',
  'menu.registration_complete': 'Kaydınız tamamlandı. Aşağıdaki menüden istediğiniz hizmeti seçin.',
  'menu.buy': '✨ Satın Al',
  'menu.sell': '✨ Sat',
  'menu.wallet': '🧳 Cüzdan',
  'menu.bonus': '🧩 Bonus',
  'menu.hochino_chat': '🐽 Hochino AI Sohbet',
  'menu.hochino_main': '🐽 Hochino AI Premier⁰¹',
  'menu.support': '🎧 Hochino AI Asistan⁰¹',
  'menu.admin_panel': '👑 Yönetim Paneli',
  'menu.channel': '📢 Kanal ve Canlı Kurlar',

  // ==================== Kanal / grup (yönetim panelinden) ====================
  'channel.not_configured': 'Şu anda görüntülenecek bir kanal veya grup tanımlanmamış.',
  'channel.message': 'Kanalı ve canlı kurları açmak için aşağıdaki düğmeyi kullanın.',
  'channel.open': 'Kanalı aç',

  // ==================== Erişim, yarım kalan adımlar ve callback\'ler ====================
  'gate.finish_registration': 'Devam etmek için önce kaydınızı tamamlayın.',
  'gate.stale_button': 'Bu düğme artık geçerli değil.',
  'flow.resume': 'Kaydınız henüz tamamlanmadı; kaldığınız adımdan devam ediyoruz.',
  'access.registration_required': 'İşlem yapabilmek için önce kayıt ve kimlik doğrulamasını tamamlamanız gerekir. Sizi bekleyen adıma yönlendiriyoruz.',
  'access.limit_exceeded': '🔒 Günlük toplam alım ve satım limitiniz {limit} Toman.\nBugün kullanılan: {used} Toman\nBugün kalan: {remaining} Toman\n\nBu sipariş izin verilen limiti aşıyor.',
  'access.limit_gold_hint': 'Limitinizi artırmak için Altın kimlik doğrulamayı tamamlayın.',
  'access.limit_gold_button': 'Altın kimlik doğrulama',
  'error.generic': 'Bir hata oluştu. Lütfen tekrar deneyin.'
};
