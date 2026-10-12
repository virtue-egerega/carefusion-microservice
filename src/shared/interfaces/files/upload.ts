export interface UploadOptions {
    file: Express.Multer.File;
    parentdirectory:string;
    directory: string;
    isOnline: boolean; // fallback to env or default
}
