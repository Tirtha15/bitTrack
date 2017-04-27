var nodemailer = require('nodemailer');


function sendMailWithNodeMailer(emailOptions) {
    var transporter = nodemailer.createTransport({
        service: 'Gmail',
        auth: {
            user: "tirthaalerts@gmail.com", // Your gmail address.
            pass: "Hopeitworks4me"
        }
    });

    var mailOptions = {
        from: emailOptions.from || "tirthaalerts@gmail.com",
        to: emailOptions.to,
        subject: emailOptions.subject,
        attachments: emailOptions.attachments
    };

    if (emailOptions.text) {
        mailOptions['text'] = emailOptions.text;
    } else if (emailOptions.html) {
        mailOptions['html'] = emailOptions.html;
    }

    transporter.sendMail(mailOptions, function (error, info) {
        if (error) {
            console.log(error);
        } else {
            console.log('Message sent: '+  info.response);
        }
    });
}

module.exports = {
    sendMailWithNodeMailer: sendMailWithNodeMailer,
    sendEmail: function(subject, msg){
        sendMailWithNodeMailer({
            to: 'tirthaghosh15@gmail.com',
            subject: subject,
            text: msg
        });
    }
};