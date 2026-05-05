// add-contact.page.ts
import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, FormControl, Validators } from '@angular/forms';
import { NavController, AlertController, LoadingController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { Contacts, PhoneType } from '@capacitor-community/contacts';
import { LocalContactsService } from '../../../services/local-contacts.service';
import { ContactHashService } from 'src/app/contact-sync/contact-hash';
import { ApiService } from 'src/app/services/api/api.service';
import { ActivatedRoute } from '@angular/router';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-add-contact',
  templateUrl: './add-contact.page.html',
  styleUrls: ['./add-contact.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule, ReactiveFormsModule]
})
export class AddContactPage implements OnInit {

  form!: FormGroup;
  extraPhones: FormControl[] = [];
  syncing = false;
  syncStatus = 'Keep your contacts up to date';
  saving = false;
  phone:string = '';
  isChecked: boolean = false;
  isPlatformUser: boolean = false;
  editContact: boolean = false;
  editable:boolean  = true;
   deviceSaved = false;
  dbSaved = false;
  

  countryCodes = [
    { flag: '🇮🇳', name: 'India',        code: '+91' },
    { flag: '🇺🇸', name: 'United States', code: '+1'  },
    { flag: '🇬🇧', name: 'UK',            code: '+44' },
    { flag: '🇦🇺', name: 'Australia',     code: '+61' },
    { flag: '🇩🇪', name: 'Germany',       code: '+49' },
    { flag: '🇸🇬', name: 'Singapore',     code: '+65' },
    { flag: '🇦🇪', name: 'UAE',           code: '+971'},
  ];

  constructor(
    private fb: FormBuilder,
    private navCtrl: NavController,
    private alertCtrl: AlertController,
    private loadingCtrl: LoadingController,
    private localContacts: LocalContactsService,
    private hashService: ContactHashService,
    private apiService: ApiService,
    private route: ActivatedRoute
  ) {
     this.form = this.fb.group({
      firstName:   ['', Validators.required],
      lastName:    [''],
      countryCode: [''],
      phone:       ['', [Validators.required, Validators.pattern(/^\d{7,15}$/)]],
    });
  }

  ngOnInit() {

 this.route.queryParamMap.subscribe(params => {
  const editParam = params.get('editContact');

  this.editContact = editParam === 'true';
  this.editable = !this.editContact;
  const phone = params.get('receiver_phone') || '';
  const phoneNumber = parsePhoneNumberFromString(phone);
  const countryCode = phoneNumber ? `+${phoneNumber.countryCallingCode}` : '';
  const nationalNumber = phoneNumber ? `${phoneNumber.nationalNumber}` : '';
  console.log(nationalNumber);

  // const countryCode = '+' + phoneNumber.countryCallingCode;
  // const nationalNumber = phoneNumber.nationalNumber;
 
  const chatTitle = params.get('chatTitle') || '';
  const isPhoneNumber = /^[+]?[0-9]+$/.test(chatTitle);
  console.log(isPhoneNumber);
  // if it is a phone number, we will treat the entire chatTitle as phone and leave first and last name empty. If it is not a phone number, we will split the chatTitle into first and last name and use the provided phone number.

  
if (isPhoneNumber) {
  // console.log("number");
   
  this.form.patchValue({
    firstName: '',
    lastName: '',
    countryCode: countryCode,
    phone: nationalNumber,
  });
  console.log(this.form.value);
   
} else {
  
  const parts = chatTitle.trim().split(' ');

  this.form.patchValue({
    firstName: parts[0] || '',
    lastName: parts.slice(1).join(' ') || '',
    countryCode: countryCode,
    phone: nationalNumber
  });
  console.log(this.form.value);
  
}
// if(this.editContact){
//      this.form.get('countryCode')?.disable();
//      this.form.get('phone')?.disable();
//   }
 });


   
  }

  removePhone(index: number) {
    this.extraPhones.splice(index, 1);
  }
  validatePhoneNumber(event: any) {
    const input = event.target as HTMLIonInputElement;
    const value = input.value as string;

    // Remove any non-digit characters
    const numericValue = value.replace(/\D/g, '');

    // Limit to 10 digits
    this.phone = numericValue.slice(0, 10);
    // Update the input value
    input.value = this.phone;
  }

  
  onToggle(event: any) {
   const isChecked = event.detail.checked;
  console.log(isChecked);
  this.isChecked = isChecked;
  }

async save() {

  if (this.form.invalid || this.saving) return;
 
  this.saving = true;

  const loading = await this.loadingCtrl.create({ message: 'Saving contact…' });

  await loading.present();
 
  try {

    const { firstName, lastName, countryCode, phone } = this.form.value;

    const fullPhone = `${countryCode}${phone}`;

   
 
    let deviceContactId: string | undefined;

    let isPlatformUser = false;
 
    // ✅ Prepare hash

    const normalizedPhone = this.hashService.normalizeForHash(fullPhone);

    const phoneHash = this.hashService.hashPhone(normalizedPhone);
 
    // ✅ STEP 1: Check platform user (ONLY for DB decision)
    if(this.editContact){
      isPlatformUser = true;
    } 
    else {
    try {

      const response = await firstValueFrom(

        this.apiService.checkPlatformUserWhileAddingContact(phoneHash)

      );

      isPlatformUser = response?.found ?? false;

    } catch (err) {

      console.error('Platform check failed:', err);

      // 👉 don't block device save if API fails

    }
  }
    // ✅ STEP 2: Save to device (independent)

    if (this.isChecked) {

      try {

        const permission = await Contacts.requestPermissions();
 
        if (permission.contacts !== 'granted') {

          throw new Error('Permission denied for contacts');

        }
 
        const result = await Contacts.createContact({

          contact: {

            name: { given: firstName, family: lastName || undefined },

            phones: [

              {

                type: PhoneType.Mobile,

                number: fullPhone,

                isPrimary: true,

              },

            ],

          },

        });
 
        deviceContactId = result.contactId;
        // console.log(fullPhone  );
        this.deviceSaved = true;

      } catch (err) {

        console.error('Device save failed:', err);

        // 👉 don't block DB save

      }

    }
 
    // ✅ STEP 3: Save to local DB (ONLY if platform user)

    if (isPlatformUser) {

      await this.localContacts.saveContact({

        firstName,

        lastName: lastName ?? '',

        countryCode,

        phone,

        fullPhone,

        deviceContactId,

      });
      // console.log(fullPhone);

    }
 
   
    this.dbSaved = true;

    this.navCtrl.back();
 
  } catch (err: any) {

    console.error('Save flow error:', err);

   

  } finally {

    this.saving = false;

    await loading.dismiss();

  }
  if (this.deviceSaved && this.dbSaved) {
  await this.showSuccessAlert();
} else if (this.deviceSaved) {
  await this.showSuccessAlert();
} else if (this.dbSaved) {
  await this.showSuccessAlert();
} else {
  await this.showErrorAlert();
}

  }

  private async showSuccessAlert() {
    const alert = await this.alertCtrl.create({
      header: 'Contact saved',
      message: `Contact  has been added .`,
      buttons: ['OK'],
    });
    await alert.present();
  }

  private async showErrorAlert() {
    const alert = await this.alertCtrl.create({
      header: 'Error',
      message: `Could not save contact. Please try again.`,
      buttons: ['OK'],
    });
    await alert.present();
  }
}