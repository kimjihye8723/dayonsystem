declare module '@ckeditor/ckeditor5-build-classic' {
    const ClassicEditor: any;
    export default ClassicEditor;
}

declare module '@ckeditor/ckeditor5-react' {
    import React from 'react';
    export class CKEditor extends React.Component<any, any> {}
}
