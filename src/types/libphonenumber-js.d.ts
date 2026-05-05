declare module 'libphonenumber-js' {
  export function parsePhoneNumberFromString(
    phone: string,
    defaultCountry?: string | number
  ): PhoneNumber | undefined;

  export class PhoneNumber {
    readonly number: string;
    readonly country?: string;
    readonly countryCallingCode?: string;
    readonly nationalNumber?: string;
    readonly valid: boolean;
    isValid(): boolean;
    getType(): string | undefined;
  }
}
