// i18n/locales/en.js — English
module.exports = {
  // ==================== Language ====================
  'lang.choose': 'Choose your preferred language.',
  'flow.language_changed': 'Your language has been updated.',

  // ==================== Terms ====================
  'rules.intro': 'Before registering, please read the Vochino⁰¹ Terms of Use carefully. You must accept the terms to continue.',
  'rules.accept': 'Accept and continue',
  'rules.decline': 'Decline',
  'rules.change_language': '🌐 Change language',
  'rules.page_label': '📄 Part {current} of {total}',
  'rules.declined': 'Continuing the registration and using services that require verification depends on accepting the Terms of Use. You can read the terms again and accept them whenever you are ready.',
  'rules.show_again': 'Read the terms again',
  'rules.unavailable': 'The Terms of Use have not been configured for this language yet, so registration cannot continue for now. Please choose another language or try again later, and contact support if the problem persists.',

  // ==================== Phone ====================
  'phone.request': 'To complete registration, share your phone number using the Telegram button below. The number must belong to your own account.',
  'phone.button': 'Share phone number',
  'phone.invalid_owner': 'The number you sent does not belong to your own Telegram account. Please use only the "Share phone number" button to send your own number.',
  'phone.use_button': 'To share your phone number, please use the "Share phone number" button at the bottom of the screen.',

  // ==================== Full name ====================
  'name.request': 'Please enter your real first and last name as shown in your personal information. This name is used to record your account details.',
  'name.invalid': 'Please enter your full first and last name so we can record your account details correctly.',

  // ==================== National ID ====================
  'nid.request': 'Enter your 10-digit Iranian national ID. Please check the digits carefully; this information is used to record your account details.',
  'nid.error_length': 'The national ID must be exactly 10 digits. Please check it and enter it again.',
  'nid.error_check': 'The national ID you entered is not valid (its check digit does not match). Please review the information and send it again.',

  // ==================== Bank card ====================
  'card.request': 'The bank card must belong to an account held in the same name as the registered full name. Please enter your own card. If the ownership does not match, the account cannot be verified.\n\nEnter your 16-digit card number. Your card PIN, CVV2 and dynamic password are never requested; please never send them.',
  'card.error_length': 'The card number must be exactly 16 digits. Please check it and enter it again.',
  'card.error_check': 'The card number you entered does not look valid. Please review it and send it again.',

  // ==================== Review ====================
  'review.step1': '⏳ Checking your submitted information…',
  'review.step2': '⏳ Checking that your information is complete and recording your account status…',
  'review.step3': '⏳ Completing your registration…',
  'review.running': 'Your registration is being completed. Please wait a moment.',

  // ==================== Result ====================
  'result.silver': 'Congratulations — your Silver verification has been approved.\n\nYour account details:\n\nFull name: {full_name}\nPhone number: {phone}\nBank card: {masked_card}\n\nDaily combined buy and sell limit: {limit} Toman\n\nYour information has been recorded. You can choose a service from the main menu.',
  'result.data_problem': 'Some of the submitted information is incomplete or invalid. To avoid recording incorrect data, please enter it again.',
  'result.error': 'A temporary error occurred while completing your registration. Your information has been saved; please send /start again to continue from this step.',

  // ==================== Main menu ====================
  'menu.title': '⫹⫺ Vochino⁰¹ Exchange',
  'menu.header': '⎙ Specialist hub for voucher trading\n⏧  Focused on speed and liquidity\n⎚ Precise execution and orderly order tracking\n☏ Direct access to online support\n☟Choose your path',
  'menu.registration_complete': 'Your registration is complete. Choose a service from the menu below.',
  'menu.buy': '✨ Buy',
  'menu.sell': '✨ Sell',
  'menu.wallet': '🧳 Wallet',
  'menu.bonus': '🧩 Bonus',
  'menu.hochino_chat': '🐽 Hochino AI Chat',
  'menu.hochino_main': '🐽 Hochino AI Premier⁰¹',
  'menu.support': '🎧 Hochino AI Assistant⁰¹',
  'menu.admin_panel': '👑 Admin Panel',
  'menu.channel': '📢 Channel & Live Rates',

  // ==================== Channel / group (from the admin panel) ====================
  'channel.not_configured': 'No channel or group is currently configured to display.',
  'channel.message': 'Use the button below to open the channel and live rates.',
  'channel.open': 'Open channel',

  // ==================== Access, incomplete steps and callbacks ====================
  'gate.finish_registration': 'Please complete your registration first.',
  'gate.stale_button': 'This button is no longer valid.',
  'flow.resume': 'Your registration is not complete yet; we will continue from the step where you left off.',
  'access.registration_required': 'To trade, you first need to complete registration and verification. We will take you to the step that is still pending.',
  'access.limit_exceeded': '🔒 Your daily combined buy and sell limit is {limit} Toman.\nUsed today: {used} Toman\nRemaining today: {remaining} Toman\n\nThis order would exceed the allowed limit.',
  'access.limit_gold_hint': 'To raise your limit, complete Gold verification.',
  'access.limit_gold_button': 'Gold verification',
  'error.generic': 'Something went wrong. Please try again.'
};
