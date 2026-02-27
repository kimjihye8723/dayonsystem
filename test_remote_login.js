import axios from 'axios';

async function testLogin() {
    try {
        console.log('Testing login for http://dayon.re-n.kr/api/login');
        const response = await axios.post('http://dayon.re-n.kr/api/login', {
            account: 'hdsw',
            password: '1234'
        });
        console.log('Response Status:', response.status);
        console.log('Response Data:', response.data);
    } catch (err) {
        if (err.response) {
            console.log('Error Status:', err.response.status);
            console.log('Error Data:', err.response.data);
        } else {
            console.error('Error:', err.message);
        }
    }
}

testLogin();
