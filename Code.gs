/**
 * Creates the add-on interface when opened in Google Sheets.
 */
function onHomepage(e) {
  var builder = CardService.newCardBuilder();
  builder.setHeader(CardService.newCardHeader()
    .setTitle('')
    .setImageStyle(CardService.ImageStyle.SQUARE));
  
  var section = CardService.newCardSection()
    .addWidget(CardService.newTextButton()
      .setText('Start OSMM')
      .setBackgroundColor("#2f974b")
      .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
      .setOnClickAction(CardService.newAction().setFunctionName('showSidebar')))
    .addWidget(CardService.newTextParagraph()
      .setText("Hope this helps!"));
  
  builder.addSection(section);
  return builder.build();
}

/**
 * Opens a sidebar in the document containing the add-on's user interface.
 */
function showSidebar() {
  var html = HtmlService.createHtmlOutputFromFile('Sidebar')
    .setTitle(' ')
    .setWidth(300);
  
  SpreadsheetApp.getUi().showSidebar(html);
}

function getSheetData() {
  var sheet = SpreadsheetApp.getActiveSheet();
  var dataRange = sheet.getDataRange();
  var data = dataRange.getValues();
  
  Logger.log('Raw data from sheet:');
  Logger.log(data);
  
  // Find email column index and all cc column indices
  var emailColumnIndex = -1;
  var ccColumnIndices = [];
  var filteredHeaders = [];
  
  // Process headers and collect indices
  data[0].forEach(function(header, index) {
    var headerLower = header.toString().toLowerCase();
    // Store non-empty, non-cc headers for variables
    if (headerLower && headerLower !== 'cc') {
      filteredHeaders.push(header);
    }
    if (headerLower.includes('email address')) {
      emailColumnIndex = index;
    }
    if (headerLower === 'cc') {
      ccColumnIndices.push(index);
    }
  });
  
  if (emailColumnIndex === -1) {
    throw new Error('No column with "email address" found in the sheet. Please add an email address column.');
  }
  
  var rows = data.slice(1).filter(row => {
    Logger.log('Checking row: ' + JSON.stringify(row));
    return row[0] && row[emailColumnIndex]; // Check first column and email column are not empty
  });
  
  Logger.log('Filtered rows:');
  Logger.log(rows);
  
  return {
    headers: data[0], // Keep original headers for data processing
    displayHeaders: filteredHeaders, // Filtered headers for variable display
    rows: rows,
    emailColumnIndex: emailColumnIndex,
    ccColumnIndices: ccColumnIndices
  };
}

function getDraftTemplates() {
  try {
    var drafts = GmailApp.getDrafts();
    // Get only the 5 most recent drafts (drafts are already sorted by date, most recent first)
    return drafts.slice(0, 5).map(function(draft) {
      var message = draft.getMessage();
      return {
        id: draft.getId(),
        subject: message.getSubject() || '(no subject)'
      };
    });
  } catch (error) {
    throw new Error('Failed to load drafts. Please make sure you have authorized the script to access Gmail.');
  }
}

function sendMailMerge(templateId, senderName) {
  var draft = GmailApp.getDraft(templateId);
  if (!draft) {
    throw new Error('Selected draft template not found');
  }
  
  var message = draft.getMessage();
  var template = {
    subject: message.getSubject() || '(no subject)',
    body: message.getBody()
  };
  
  var data = getSheetData();
  var headers = data.headers.map(function(header) { return header.toLowerCase(); });
  var rows = data.rows;
  var emailColumnIndex = data.emailColumnIndex;
  var ccColumnIndices = data.ccColumnIndices;
  var sent = 0;
  var errors = [];
  
  rows.forEach(function(row, rowIndex) {
    try {
      var personalizedBody = template.body;
      var personalizedSubject = template.subject;
      
      // Replace all variables in both subject and body
      headers.forEach(function(header, index) {
        var value = row[index];
        var stringValue = (value === 0 || value) ? String(value) : '';
        var regex = new RegExp('{{\\s*' + header + '\\s*}}', 'gi');
        personalizedBody = personalizedBody.replace(regex, stringValue);
        personalizedSubject = personalizedSubject.replace(regex, stringValue);
      });
      
      // Get email from the email column and clean it
      var email = String(row[emailColumnIndex]).toLowerCase().trim();
      
      // Get CC emails from all CC columns
      var ccEmails = [];
      ccColumnIndices.forEach(function(ccIndex) {
        var ccEmail = String(row[ccIndex] || '').toLowerCase().trim();
        // Basic email validation for CC
        if (ccEmail && ccEmail.includes('@') && ccEmail.slice(ccEmail.indexOf('@')).includes('.')) {
          ccEmails.push(ccEmail);
        }
      });
      
      var options = {
        htmlBody: personalizedBody,
        name: senderName || 'Mail Merge'
      };
      
      // Add CC recipients if any valid emails were found
      if (ccEmails.length > 0) {
        options.cc = ccEmails.join(',');
      }
      
      // Keep strict validation for primary email
      if (!email.match(/^[^@\s]+@[^@\s]+\.[^@\s]+$/)) {
        throw new Error('Invalid email format: ' + email);
      }
      
      // Send the email
      GmailApp.sendEmail(
        email,
        personalizedSubject,
        '',  // Plain text body (empty since we're sending HTML)
        options
      );
      sent++;
      
      // Add small delay between sends
      Utilities.sleep(500);
      
    } catch (error) {
      Logger.log('Failed to send email to ' + row[emailColumnIndex] + ': ' + error.toString());
      errors.push('Error sending to ' + row[0] + ': ' + error.toString());
    }
  });
  
  var message = sent + ' emails sent successfully';
  if (errors.length > 0) {
    message += '\n' + errors.join('\n');
  }
  return message;
}

function removeRecipient(index) {
  try {
    var sheet = SpreadsheetApp.getActiveSheet();
    var dataRange = sheet.getDataRange();
    var data = dataRange.getValues();
    
    // Add 1 to skip header row
    var rowToDelete = index + 2;
    
    // Delete the row
    sheet.deleteRow(rowToDelete);
    
    return { success: true };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function sendTestEmail(templateId, senderName, senderEmail) {
  var draft = GmailApp.getDraft(templateId);
  if (!draft) {
    throw new Error('Selected draft template not found');
  }
  
  var message = draft.getMessage();
  var template = {
    subject: message.getSubject() || '(no subject)',
    body: message.getBody()
  };
  
  var data = getSheetData();
  var headers = data.headers.map(function(header) { return header.toLowerCase(); });
  var firstRow = data.rows[0] || [];
  
  var personalizedBody = template.body;
  var personalizedSubject = template.subject;
  
  headers.forEach(function(header, index) {
    var value = firstRow[index];
    var stringValue = (value === 0 || value) ? String(value) : '';
    var regex = new RegExp('{{\\s*' + header + '\\s*}}', 'gi');
    personalizedBody = personalizedBody.replace(regex, stringValue);
    personalizedSubject = personalizedSubject.replace(regex, stringValue);
  });
  
  senderEmail = String(senderEmail).toLowerCase().trim();
  
  try {
    // For test emails, we only send to the user without any CC
    GmailApp.sendEmail(
      senderEmail,
      '[TEST] ' + personalizedSubject,  // Add [TEST] prefix to subject
      '',  // Plain text body (empty since we're sending HTML)
      {
        htmlBody: personalizedBody,
        name: senderName || 'Mail Merge'
      }
    );
    return 'Test email sent successfully to ' + senderEmail;
  } catch (error) {
    Logger.log('Failed to send test email: ' + error.toString());
    throw new Error('Failed to send test email: ' + error.toString());
  }
}

function getUserEmail() {
  var email = Session.getEffectiveUser().getEmail();
  if (!email) {
    throw new Error('Could not determine user email. Please make sure you are logged in.');
  }
  return email;
} 