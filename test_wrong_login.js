import axios from 'axios';

async function testWrongLogin() {
    try {
        console.log('Testing login with WRONG password for http://dayon.re-n.kr/api/login');
        const response = await axios.post('http://dayon.re-n.kr/api/login', {
            account: 'hdsw',
            password: 'WRONG_PASSWORD'
        });
        console.log('Response Status:', response.status);
    } catch (err) {
        if (err.response) {
            console.log('Error Status:', err.response.status);
            console.log('Error Data:', err.response.data);
        } else {
            console.error('Error:', err.message);
        }
    }
}

testWrongLogin();
